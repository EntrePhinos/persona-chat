// Componentes compartidos de UI: avatares, badges, navbar.
import { Link } from "@tanstack/react-router";
import { initials, type Influencer } from "@/lib/influencer";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-semibold text-foreground ${className}`}>
      <span className="size-2.5 rounded-full bg-primary" aria-hidden />
      <span className="tracking-tight">AlterEgo</span>
    </Link>
  );
}

export function Navbar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur">
      <Logo />
      <div className="flex items-center gap-3 text-sm text-muted-foreground">{right}</div>
    </header>
  );
}

export function Avatar({
  influencer,
  size = 48,
}: {
  influencer: Pick<Influencer, "name" | "photo_url" | "accent_color">;
  size?: number;
}) {
  const bg = influencer.accent_color || "#6C47FF";
  if (influencer.photo_url) {
    return (
      <img
        src={influencer.photo_url}
        alt={influencer.name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.35 }}
    >
      {initials(influencer.name)}
    </div>
  );
}

export function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "primary" | "success";
}) {
  const styles: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function PulseDot({ color = "rgb(16 185 129)" }: { color?: string }) {
  return (
    <span className="relative flex size-2">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
        style={{ background: color }}
      />
      <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
    </span>
  );
}
