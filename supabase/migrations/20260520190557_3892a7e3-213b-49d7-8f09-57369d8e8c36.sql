
-- Extensión vector
create extension if not exists vector;

-- Influencers
create table public.influencers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  photo_url text,
  tagline text,
  bio text,
  accent_color text default '#6C47FF',
  badge_label text default 'Principal',
  system_prompt text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid references public.influencers(id) on delete cascade,
  youtube_id text,
  title text,
  duration_seconds int,
  status text default 'pending',
  processed_at timestamptz,
  created_at timestamptz default now()
);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid references public.influencers(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index chunks_embedding_idx on public.chunks
  using hnsw (embedding vector_cosine_ops);
create index chunks_influencer_idx on public.chunks(influencer_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  influencer_id uuid references public.influencers(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  ip_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index conversations_ip_day_idx on public.conversations(ip_hash, created_at);
create index conversations_influencer_idx on public.conversations(influencer_id);

-- RLS: lectura pública para influencers; el resto se accede sólo desde el servidor (service role bypasses RLS)
alter table public.influencers enable row level security;
alter table public.videos enable row level security;
alter table public.chunks enable row level security;
alter table public.conversations enable row level security;

create policy "Public read influencers" on public.influencers
  for select using (true);

create policy "Public read videos" on public.videos
  for select using (true);

-- match_chunks RPC
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_influencer_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select c.id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.influencer_id = match_influencer_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Seed
insert into public.influencers (name, slug, tagline, bio, badge_label) values
  ('Alex Rivera', 'alex-rivera', 'Construyendo el futuro, un video a la vez.', 'Creador de contenido sobre tecnología, productividad y emprendimiento. +5 años compartiendo aprendizajes en YouTube.', 'Principal'),
  ('Ibai Llanos', 'ibai-llanos', 'Aquí para entretenerte y hacerte reír.', 'Streamer y creador de contenido español. Conocido por sus retransmisiones, humor y eventos únicos como La Velada del Año.', 'Demo');

-- Storage bucket público para fotos
insert into storage.buckets (id, name, public) values ('influencer-photos', 'influencer-photos', true)
on conflict (id) do nothing;

create policy "Public read influencer photos" on storage.objects
  for select using (bucket_id = 'influencer-photos');

create policy "Anyone can upload influencer photos" on storage.objects
  for insert with check (bucket_id = 'influencer-photos');

create policy "Anyone can update influencer photos" on storage.objects
  for update using (bucket_id = 'influencer-photos');
