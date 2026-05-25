import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Gemini Live API model. See https://ai.google.dev/gemini-api/docs/live
const MODEL = "gemini-live-2.5-flash-preview";
const VOICE = "Aoede";

export const Route = createFileRoute("/api/live-token")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { influencer_id } = (await request.json().catch(() => ({}))) as {
            influencer_id?: string;
          };

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return json({ error: "GEMINI_API_KEY no configurada en el servidor." }, 500);
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
          const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();

          const body = {
            uses: 1,
            expireTime,
            newSessionExpireTime,
            bidiGenerateContentSetup: {
              model: `models/${MODEL}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: VOICE },
                  },
                },
              },
              systemInstruction: { parts: [{ text: instructions }] },
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false,
                  silenceDurationMs: 1200,
                  prefixPaddingMs: 300,
                },
                activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
                turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
              },
            },
          };

          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1alpha/authTokens?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );

          if (!res.ok) {
            const errText = await res.text();
            console.error("authTokens failed:", res.status, errText);
            return json(
              {
                error: `No se pudo crear el token de Gemini Live (HTTP ${res.status}). Revisa que GEMINI_API_KEY sea válida y que tu cuenta tenga acceso a Live API.`,
                detail: errText.slice(0, 500),
              },
              502,
            );
          }

          const data = (await res.json()) as { name?: string };
          if (!data.name) {
            return json({ error: "Respuesta inesperada del servicio de tokens." }, 502);
          }

          return json({ token: data.name, model: MODEL, expiresAt: expireTime });
        } catch (err) {
          console.error("live-token error:", err);
          return json({ error: err instanceof Error ? err.message : "Error interno" }, 500);
        }
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
