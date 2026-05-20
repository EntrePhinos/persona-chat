export type Influencer = {
  id: string;
  name: string;
  slug: string;
  photo_url: string | null;
  tagline: string | null;
  bio: string | null;
  accent_color: string | null;
  badge_label: string | null;
  system_prompt: string | null;
};

export function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const RATE_LIMIT_PER_DAY = 50;

export const QUICK_SUGGESTIONS: Record<string, string[]> = {
  default: [
    "¿Cómo empezaste?",
    "Dame un consejo",
    "¿Qué te inspira?",
    "Cuéntame algo personal",
  ],
};
