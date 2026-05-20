import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { z } from "zod";

// Pipeline simulado de ingesta de YouTube — el MVP no hace ingesta real.
const BodySchema = z.object({
  influencer_id: z.string().uuid(),
  source_type: z.enum(["channel", "video"]),
  url: z.string().url(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const body = BodySchema.parse(await request.json());
        const stages = [
          { name: "Conectando con YouTube…", ms: 600 },
          { name: "Descargando metadatos…", ms: 800 },
          { name: `Procesando ${body.source_type === "channel" ? body.limit ?? 25 : 1} video(s)…`, ms: 1200 },
          { name: "Transcribiendo audio…", ms: 1500 },
          { name: "Generando embeddings…", ms: 1200 },
          { name: "Indexando en base de datos…", ms: 800 },
        ];
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            for (let i = 0; i < stages.length; i++) {
              const s = stages[i];
              const event = {
                stage: s.name,
                progress: Math.round(((i + 1) / stages.length) * 100),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              await new Promise((r) => setTimeout(r, s.ms));
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ done: true, message: "Simulación completa (MVP)" })}\n\n`,
              ),
            );
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});
