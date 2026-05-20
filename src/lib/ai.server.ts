// Server-only helpers for Lovable AI Gateway.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
      dimensions: 1536,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding error ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function streamChat(messages: ChatMsg[]): Promise<Response> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  return fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      stream: true,
      temperature: 0.85,
      max_tokens: 220,
    }),
  });
}

export async function completeChat(messages: ChatMsg[]): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      temperature: 0.8,
      max_tokens: 220,
    }),
  });
  if (!res.ok) throw new Error(`Chat error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0]?.message?.content ?? "";
}

export function chunkText(text: string, target = 500, overlap = 50): string[] {
  // word-based approximation: ~1.3 tokens per word, so ~380 words per chunk
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const wordsPerChunk = Math.round(target / 1.3);
  const overlapWords = Math.round(overlap / 1.3);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + wordsPerChunk).join(" ");
    if (slice.trim().length > 0) out.push(slice);
    i += Math.max(1, wordsPerChunk - overlapWords);
  }
  return out;
}
