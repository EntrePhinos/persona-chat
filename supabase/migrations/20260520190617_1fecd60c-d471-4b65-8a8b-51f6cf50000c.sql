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
set search_path = public
as $$
  select c.id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.influencer_id = match_influencer_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;