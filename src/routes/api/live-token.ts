import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Current Gemini Live API model (native audio dialog). See:
// https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
const MODEL = "gemini-live-2.5-flash-preview";

export const Route = createFileRoute("/api/live-token")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { influencer_id } = (await request.json()) as { influencer_id?: string };

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: "GEMINI_API_KEY no configurada" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          let instructions =
            "Eres un asistente conversacional. Responde en personaje, en primera persona, con frases cortas y naturales.";

          if (influencer_id) {
            const { data: influencer } = await supabaseAdmin
              .from("influencers")
              .select("name, bio, tagline, system_prompt")
              .eq("id", influencer_id)
              .maybeSingle();

            if (influencer) {
              const sys =
                influencer.system_prompt ||
                `Eres ${influencer.name}. ${influencer.bio ?? ""} ${influencer.tagline ?? ""}`.trim();
              instructions = `${sys}

REGLAS PARA LLAMADAS DE VOZ:
- Responde SIEMPRE en personaje, en primera persona.
- Respuestas cortas: máximo 2-3 frases. Tono conversacional y natural.
- No des consejos médicos, legales ni financieros.
- Si el usuario te interrumpe, para inmediatamente y escucha.
- Habla en el mismo idioma que el usuario.`;
            }
          }

          const now = Date.now();
          const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
          const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();

          // REST endpoint for ephemeral tokens lives under v1alpha/authTokens.
          const ephemeralRes = await fetch(
            `https://generativelanguage.googleapis.com/v1alpha/authTokens?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uses: 1,
                expireTime,
                newSessionExpireTime,
                liveConnectConstraints: {
                  model: MODEL,
                  config: {
                    responseModalities: ["AUDIO"],
                    systemInstruction: { parts: [{ text: instructions }] },
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Aoede" },
                      },
                    },
                  },
                },
              }),
            }
          );

          if (!ephemeralRes.ok) {
            const err = await ephemeralRes.text();
            console.error("Gemini ephemeral token error:", ephemeralRes.status, err);
            return new Response(
              JSON.stringify({ error: "No se pudo crear sesión de voz", details: err }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          // Response shape: { name: "authTokens/xxx", expireTime, newSessionExpireTime, ... }
          const json = (await ephemeralRes.json()) as { name?: string };
          const token = json.name;

          if (!token) {
            return new Response(
              JSON.stringify({ error: "Respuesta inválida del proveedor" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(JSON.stringify({ token, model: MODEL }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("live-token error:", err);
          return new Response(
            JSON.stringify({ error: "Error interno" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
