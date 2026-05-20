import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listInfluencers = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("influencers")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { influencers: data ?? [] };
  },
);

export const getInfluencerBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("influencers")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { influencer: null, stats: { videos: 0, chunks: 0 } };
    const [{ count: videos }, { count: chunks }] = await Promise.all([
      supabaseAdmin
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("influencer_id", row.id),
      supabaseAdmin
        .from("chunks")
        .select("id", { count: "exact", head: true })
        .eq("influencer_id", row.id),
    ]);
    return {
      influencer: row,
      stats: { videos: videos ?? 0, chunks: chunks ?? 0 },
    };
  });

export const updateInfluencer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120),
        slug: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9-]+$/, "Slug solo puede tener letras minúsculas, números y guiones"),
        photo_url: z.string().url().nullable().or(z.literal("")).optional(),
        tagline: z.string().max(200).nullable().optional(),
        bio: z.string().max(800).nullable().optional(),
        accent_color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .nullable()
          .optional(),
        badge_label: z.string().max(40).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("influencers")
      .update({ ...patch, photo_url: patch.photo_url || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInfluencerVideos = createServerFn({ method: "GET" })
  .inputValidator((d: { influencer_id: string }) =>
    z.object({ influencer_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: videos, error } = await supabaseAdmin
      .from("videos")
      .select("id, title, youtube_id, duration_seconds, status, processed_at, created_at")
      .eq("influencer_id", data.influencer_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { videos: videos ?? [] };
  });

export const listInfluencerTranscripts = createServerFn({ method: "GET" })
  .inputValidator((d: { influencer_id: string }) =>
    z.object({ influencer_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("chunks")
      .select("metadata, created_at")
      .eq("influencer_id", data.influencer_id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const grouped = new Map<
      string,
      { title: string; language: string; fragments: number; created_at: string }
    >();
    for (const r of rows ?? []) {
      const md = (r.metadata ?? {}) as Record<string, unknown>;
      const source = (md.source as string) || (md.title as string) || "Sin título";
      const key = `${source}-${md.language ?? ""}`;
      const cur = grouped.get(key);
      if (cur) cur.fragments += 1;
      else
        grouped.set(key, {
          title: source,
          language: (md.language as string) || "—",
          fragments: 1,
          created_at: r.created_at as string,
        });
    }
    return { transcripts: Array.from(grouped.values()).slice(0, 30) };
  });
