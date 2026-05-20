import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { ingestText } from "@/lib/ingest.functions";

export const Route = createFileRoute("/api/ingest-text")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json();
          const result = await ingestText({ data: body });
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
