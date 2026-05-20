import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Navbar, Avatar, Badge } from "@/components/brand";
import { listInfluencers } from "@/lib/influencer.functions";
import type { Influencer } from "@/lib/influencer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AlterEgo — Conversa con tus influencers favoritos" },
      {
        name: "description",
        content:
          "Habla por texto o por voz con réplicas conversacionales de tus creadores favoritos, entrenadas con su propio contenido.",
      },
      { property: "og:title", content: "AlterEgo — Conversa con tus influencers favoritos" },
      {
        property: "og:description",
        content: "Réplicas conversacionales entrenadas con el contenido de cada creador.",
      },
    ],
  }),
  loader: () => listInfluencers(),
  component: Index,
});

function Index() {
  const { data } = useSuspenseQuery({
    queryKey: ["influencers"],
    queryFn: () => listInfluencers(),
    initialData: Route.useLoaderData(),
  });
  const influencers = data.influencers as Influencer[];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="hero-gradient">
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center">
          <h1 className="text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Elige con quién hablar
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            Selecciona un influencer para iniciar la conversación. Texto o llamada de voz, en
            tiempo real.
          </p>
        </section>

        <section className="mx-auto grid max-w-4xl grid-cols-1 gap-6 px-6 pb-24 sm:grid-cols-2">
          {influencers.map((inf) => (
            <Link
              key={inf.id}
              to="/$slug"
              params={{ slug: inf.slug }}
              className="group cursor-pointer rounded-2xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-1 hover:border-primary/20 hover:shadow-card"
            >
              <div className="flex items-start gap-4">
                <Avatar influencer={inf} size={64} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{inf.name}</h3>
                    {inf.badge_label ? <Badge variant="primary">{inf.badge_label}</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{inf.bio}</p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{inf.tagline}</span>
                <span className="font-medium text-primary transition-transform group-hover:translate-x-0.5">
                  Hablar →
                </span>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
