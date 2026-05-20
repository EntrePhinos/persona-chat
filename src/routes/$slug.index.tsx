import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Navbar, Avatar, Badge } from "@/components/brand";
import { getInfluencerBySlug } from "@/lib/influencer.functions";

export const Route = createFileRoute("/$slug/")({
  head: ({ params }) => ({
    meta: [
      { title: `Habla con ${params.slug} · AlterEgo` },
      { name: "description", content: `Conversa o llama a la réplica de ${params.slug}.` },
    ],
  }),
  loader: ({ params }) => getInfluencerBySlug({ data: { slug: params.slug } }),
  component: Landing,
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center text-center">
      <div>
        <h1 className="text-3xl font-semibold">Influencer no encontrado</h1>
        <Link to="/" className="mt-4 inline-block text-primary">Volver al inicio</Link>
      </div>
    </div>
  ),
});

function Landing() {
  const { slug } = Route.useParams();
  const { data, isFetching } = useSuspenseQuery({
    queryKey: ["influencer", slug],
    queryFn: () => getInfluencerBySlug({ data: { slug } }),
    initialData: Route.useLoaderData(),
  });
  const inf = data.influencer;

  if (!inf) {
    return (
      <div className="grid min-h-screen place-items-center text-center">
        <div>
          <h1 className="text-3xl font-semibold">Influencer no encontrado</h1>
          <Link to="/" className="mt-4 inline-block text-primary">Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        right={
          <Link to="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
        }
      />
      <main className="hero-gradient">
        <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
          <div className="flex justify-center">
            {isFetching ? (
              <div className="size-32 animate-pulse rounded-full bg-muted" />
            ) : (
              <Avatar influencer={inf} size={128} />
            )}
          </div>

          {isFetching ? (
            <>
              <div className="mx-auto mt-6 h-8 w-48 animate-pulse rounded-lg bg-muted" />
              <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="mx-auto mt-4 h-16 w-full max-w-xl animate-pulse rounded-lg bg-muted" />
            </>
          ) : (
            <>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {inf.name}
              </h1>
              {inf.tagline ? (
                <p className="mt-3 text-lg text-primary">{inf.tagline}</p>
              ) : null}
              {inf.bio ? (
                <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">{inf.bio}</p>
              ) : null}
            </>
          )}

          <div className="mt-8">
            <Link
              to="/$slug/chat"
              params={{ slug: inf.slug }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
            >
              Hablar con {inf.name} →
            </Link>
          </div>

          <div className="mx-auto mt-12 grid max-w-md grid-cols-3 gap-3 text-center">
            {isFetching ? (
              <>
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
              </>
            ) : (
              <>
                <Stat label="Videos" value={String(data.stats.videos)} />
                <Stat label="Fragmentos" value={String(data.stats.chunks)} />
                <Stat label="Disponible" value="24/7" />
              </>
            )}
          </div>

          <div className="mt-10">
            <Badge>{inf.badge_label ?? "AlterEgo"}</Badge>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
