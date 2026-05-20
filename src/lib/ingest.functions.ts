import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chunkText, embed } from "@/lib/ai.server";

export const ingestText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        influencer_id: z.string().uuid(),
        text: z.string().min(20).max(200000),
        source: z.string().min(1).max(200),
        language: z.string().max(20).optional(),
        kind: z.enum(["transcript", "interview"]).default("transcript"),
        question: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const chunks = chunkText(data.text);
    let inserted = 0;
    for (const c of chunks) {
      const embedding = await embed(c);
      const { error } = await supabaseAdmin.from("chunks").insert({
        influencer_id: data.influencer_id,
        content: c,
        embedding: embedding as unknown as string,
        metadata: {
          source: data.source,
          language: data.language ?? null,
          kind: data.kind,
          question: data.question ?? null,
        },
      });
      if (error) throw new Error(error.message);
      inserted += 1;
    }
    return { ok: true, fragments: inserted };
  });
