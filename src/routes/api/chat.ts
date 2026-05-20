import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed, streamChat, type ChatMsg } from "@/lib/ai.server";
import { RATE_LIMIT_PER_DAY } from "@/lib/influencer";

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().min(1).max(80),
  influencer_id: z.string().uuid(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(40)
    .default([]),
});

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "salt-alterego-v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = BodySchema.parse(await request.json());
          const ipHash = await hashIp(getClientIp(request));

          // Rate limit: count messages today by ip_hash
          const startOfDay = new Date();
          startOfDay.setUTCHours(0, 0, 0, 0);
          const { data: todayRows } = await supabaseAdmin
            .from("conversations")
            .select("messages")
            .eq("ip_hash", ipHash)
            .gte("created_at", startOfDay.toISOString());
          const userMessagesToday =
            (todayRows ?? []).reduce((acc, row) => {
              const msgs = (row.messages as { role: string }[]) ?? [];
              return acc + msgs.filter((m) => m.role === "user").length;
            }, 0);
          if (userMessagesToday >= RATE_LIMIT_PER_DAY) {
            return new Response(
              JSON.stringify({
                error: "Has alcanzado el límite de 50 mensajes hoy. Vuelve mañana.",
              }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }

          // Influencer + RAG
          const { data: influencer } = await supabaseAdmin
            .from("influencers")
            .select("*")
            .eq("id", body.influencer_id)
            .maybeSingle();
          if (!influencer) {
            return new Response(JSON.stringify({ error: "Influencer no encontrado" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          let contextChunks = "";
          try {
            const queryEmbedding = await embed(body.message);
            const { data: matches } = await supabaseAdmin.rpc("match_chunks", {
              query_embedding: queryEmbedding as unknown as string,
              match_influencer_id: body.influencer_id,
              match_count: 5,
            });
            contextChunks = (matches ?? [])
              .map((m: { content: string }) => `- ${m.content}`)
              .join("\n");
          } catch (err) {
            console.warn("RAG skipped:", err);
          }

          const systemPrompt =
            influencer.system_prompt ||
            `Eres ${influencer.name}. ${influencer.bio ?? ""} ${influencer.tagline ?? ""}`.trim();

          const messages: ChatMsg[] = [
            {
              role: "system",
              content: `${systemPrompt}

Contexto de tu propio contenido (úsalo como inspiración para responder en tu voz, pero no lo cites textualmente):
${contextChunks || "(sin contexto aún)"}

REGLAS:
- Responde SIEMPRE en personaje, en primera persona.
- Máximo 2-3 frases. Tono natural y conversacional.
- No des consejos médicos, legales ni financieros.
- Si te preguntan algo fuera de tu rango, redirige con humor a tus temas.`,
            },
            ...body.history.slice(-8).map((h) => ({ role: h.role, content: h.content }) as ChatMsg),
            { role: "user", content: body.message },
          ];

          const upstream = await streamChat(messages);
          if (!upstream.ok || !upstream.body) {
            const txt = await upstream.text().catch(() => "");
            const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 500;
            const msg =
              upstream.status === 429
                ? "El servicio de IA está saturado. Intenta de nuevo en unos segundos."
                : upstream.status === 402
                  ? "Se acabaron los créditos de IA. Añade créditos al workspace."
                  : "Error contactando al modelo de IA.";
            console.error("AI gateway error", upstream.status, txt);
            return new Response(JSON.stringify({ error: msg }), {
              status,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Re-stream SSE parsing to plain delta lines for the client
          let fullText = "";
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const reader = upstream.body!.getReader();
              const decoder = new TextDecoder();
              const encoder = new TextEncoder();
              let buffer = "";
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() ?? "";
                  for (const raw of lines) {
                    const line = raw.trim();
                    if (!line.startsWith("data:")) continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") continue;
                    try {
                      const json = JSON.parse(payload);
                      const delta = json.choices?.[0]?.delta?.content ?? "";
                      if (delta) {
                        fullText += delta;
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
                        );
                      }
                    } catch {
                      // ignore non-JSON keep-alives
                    }
                  }
                }
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              } catch (err) {
                console.error("stream error", err);
              } finally {
                controller.close();
                // Persist conversation asynchronously
                try {
                  const { data: existing } = await supabaseAdmin
                    .from("conversations")
                    .select("id, messages")
                    .eq("session_id", body.session_id)
                    .eq("influencer_id", body.influencer_id)
                    .maybeSingle();
                  const newMsgs = [
                    ...((existing?.messages as unknown[]) ?? []),
                    { role: "user", content: body.message, ts: Date.now() },
                    { role: "assistant", content: fullText, ts: Date.now() },
                  ];
                  if (existing) {
                    await supabaseAdmin
                      .from("conversations")
                      .update({ messages: newMsgs, updated_at: new Date().toISOString() })
                      .eq("id", existing.id);
                  } else {
                    await supabaseAdmin.from("conversations").insert({
                      session_id: body.session_id,
                      influencer_id: body.influencer_id,
                      ip_hash: ipHash,
                      messages: newMsgs,
                    });
                  }
                } catch (e) {
                  console.error("persist error", e);
                }
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "X-Messages-Remaining": String(RATE_LIMIT_PER_DAY - userMessagesToday - 1),
            },
          });
        } catch (err) {
          console.error("chat handler error", err);
          const msg = err instanceof Error ? err.message : "Error inesperado";
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
