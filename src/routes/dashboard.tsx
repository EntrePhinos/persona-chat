import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Logo, Badge } from "@/components/brand";
import {
  listInfluencers,
  updateInfluencer,
  listInfluencerTranscripts,
} from "@/lib/influencer.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Influencer } from "@/lib/influencer";
import { Check, ChevronDown, User, GraduationCap, BarChart3, Menu, X } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · AlterEgo" }] }),
  loader: () => listInfluencers(),
  component: Dashboard,
});

type Section = "profile" | "train" | "analytics";

function Dashboard() {
  const initial = Route.useLoaderData();
  const { data } = useQuery({
    queryKey: ["influencers"],
    queryFn: () => listInfluencers(),
    initialData: initial,
  });
  const influencers = (data?.influencers ?? []) as Influencer[];
  const [activeId, setActiveId] = useState(influencers[0]?.id);
  const [section, setSection] = useState<Section>("profile");
  const [menuOpen, setMenuOpen] = useState(false);
  const active = influencers.find((i) => i.id === activeId) ?? influencers[0];

  if (!active) return <div className="p-10">No hay influencers.</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen((v) => !v)} className="sm:hidden">
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <Logo />
            <span className="hidden text-sm text-muted-foreground sm:inline">· Dashboard</span>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Ver chat público →
          </Link>
        </div>
        <div className="flex items-center gap-3 border-t border-border/60 px-4 py-3 sm:px-6">
          <span className="text-sm text-muted-foreground">Editando:</span>
          <InfluencerPicker
            influencers={influencers}
            active={active}
            onSelect={(id) => setActiveId(id)}
          />
        </div>
      </header>

      <div className="flex">
        <aside
          className={`${menuOpen ? "block" : "hidden"} w-56 shrink-0 border-r border-border/60 bg-sidebar sm:block`}
        >
          <nav className="flex flex-col gap-1 p-4">
            <SideItem icon={User} label="Perfil del Influencer" active={section === "profile"} onClick={() => { setSection("profile"); setMenuOpen(false); }} />
            <SideItem icon={GraduationCap} label="Entrenar Clon" active={section === "train"} onClick={() => { setSection("train"); setMenuOpen(false); }} />
            <SideItem icon={BarChart3} label="Analytics" active={section === "analytics"} onClick={() => { setSection("analytics"); setMenuOpen(false); }} />
          </nav>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary">
            Todos los cambios aplican solo a {active.name}
          </div>
          {section === "profile" && <ProfileSection influencer={active} />}
          {section === "train" && <TrainSection influencer={active} />}
          {section === "analytics" && <AnalyticsSection influencer={active} />}
        </main>
      </div>
    </div>
  );
}

function SideItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof User;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

function InfluencerPicker({
  influencers,
  active,
  onSelect,
}: {
  influencers: Influencer[];
  active: Influencer;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Avatar influencer={active} size={24} />
        <span className="font-medium">{active.name}</span>
        <span className="text-muted-foreground">/{active.slug}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-border bg-popover p-1 shadow-card">
          {influencers.map((i) => (
            <button
              key={i.id}
              onClick={() => { onSelect(i.id); setOpen(false); }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
            >
              <Avatar influencer={i} size={32} />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {i.name}
                  {i.badge_label && <Badge variant="primary">{i.badge_label}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">/{i.slug}</div>
              </div>
              {i.id === active.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileSection({ influencer }: { influencer: Influencer }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: influencer.name,
    slug: influencer.slug,
    photo_url: influencer.photo_url ?? "",
    tagline: influencer.tagline ?? "",
    bio: influencer.bio ?? "",
    accent_color: influencer.accent_color ?? "#6C47FF",
    badge_label: influencer.badge_label ?? "",
    system_prompt: influencer.system_prompt ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm({
      name: influencer.name,
      slug: influencer.slug,
      photo_url: influencer.photo_url ?? "",
      tagline: influencer.tagline ?? "",
      bio: influencer.bio ?? "",
      accent_color: influencer.accent_color ?? "#6C47FF",
      badge_label: influencer.badge_label ?? "",
      system_prompt: influencer.system_prompt ?? "",
    });
  }, [influencer.id]);

  async function onUpload(file: File) {
    if (!/jpeg|jpg|png/.test(file.type)) {
      setMsg("Solo JPG o PNG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMsg("Máximo 2MB.");
      return;
    }
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    }).catch(() => {});
    URL.revokeObjectURL(objUrl);
    if (img.naturalWidth < 400 || img.naturalHeight < 400) {
      setMsg("La imagen debe ser mínimo 400×400 píxeles.");
      return;
    }
    const notSquare = Math.abs(img.naturalWidth - img.naturalHeight) > 20;
    const path = `${influencer.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("influencer-photos").upload(path, file);
    if (error) { setMsg(error.message); return; }
    const { data } = supabase.storage.from("influencer-photos").getPublicUrl(path);
    setForm((f) => ({ ...f, photo_url: data.publicUrl }));
    setMsg(
      notSquare
        ? "⚠️ La imagen no es cuadrada — se recomienda una foto cuadrada. Recuerda guardar cambios."
        : "Foto subida. Recuerda guardar cambios.",
    );
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await updateInfluencer({ data: { id: influencer.id, ...form } });
      setMsg("Cambios guardados.");
      qc.invalidateQueries({ queryKey: ["influencers"] });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-xl font-semibold">Perfil del Influencer</h2>
      <Field label="Nombre">
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Slug (URL)">
        <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">alterego.app/{form.slug}</p>
      </Field>
      <Field label="Foto">
        <div className="flex gap-2">
          <input className="input" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://…" />
          <button onClick={() => fileRef.current?.click()} className="btn-secondary">Subir imagen</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">JPG o PNG, máx 2MB, mín 400×400 cuadrada.</p>
      </Field>
      <Field label="Frase característica">
        <input className="input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
      </Field>
      <Field label="Bio corta">
        <textarea className="input min-h-[80px]" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      </Field>
      <Field label="Prompt del sistema (personalidad del clon)">
        <textarea
          className="input min-h-[120px] font-mono text-xs"
          value={form.system_prompt}
          onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
          placeholder={`Eres ${influencer.name}. Responde siempre en primera persona con tono conversacional…`}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Define la personalidad base del clon. Si está vacío, se genera automáticamente desde la bio.
        </p>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Color acento">
          <input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
        </Field>
        <Field label="Badge">
          <input className="input" value={form.badge_label} onChange={(e) => setForm({ ...form, badge_label: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Guardando…" : "Guardar cambios"}</button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>

      <style>{`
        .input { width: 100%; border: 1px solid var(--color-border); background: var(--color-card); border-radius: 10px; padding: 8px 12px; font-size: 14px; outline: none; }
        .input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 15%, transparent); }
        .btn-primary { background: var(--color-primary); color: var(--color-primary-foreground); padding: 8px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; }
        .btn-primary:disabled { opacity: 0.6; }
        .btn-secondary { background: var(--color-muted); color: var(--color-foreground); padding: 8px 14px; border-radius: 10px; font-size: 14px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const INTERVIEW_QUESTIONS = [
  "¿Cómo te describes en 3 palabras?",
  "¿De qué temas te apasiona hablar?",
  "¿Cuál es tu filosofía de vida?",
  "¿Qué consejo le darías a alguien que empieza desde cero?",
  "¿Cómo hablas normalmente con tu audiencia?",
  "¿Qué palabras o frases usas mucho?",
  "¿Qué temas nunca tocarías o evitas?",
  "¿Cuál ha sido tu mayor logro hasta ahora?",
  "¿Qué te hace diferente a otros creadores?",
  "¿Qué quieres que la gente sienta después de hablar con tu clon?",
];

function TrainSection({ influencer }: { influencer: Influencer }) {
  const [tab, setTab] = useState<"channel" | "video" | "manual" | "interview">("channel");
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Entrenar Clon</h2>
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 text-sm">
        {[
          ["channel", "Canal completo"],
          ["video", "Video individual"],
          ["manual", "Transcripción manual"],
          ["interview", "Entrevista IA"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            className={`flex-1 rounded-lg px-3 py-2 transition-colors ${tab === k ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "channel" && <ChannelTab influencer={influencer} />}
      {tab === "video" && <VideoTab influencer={influencer} />}
      {tab === "manual" && <ManualTab influencer={influencer} />}
      {tab === "interview" && <InterviewTab influencer={influencer} />}
    </div>
  );
}

const DEFAULT_IGNORE = "patrocinado, suscríbete, dale like, comenta abajo, link en bio, sígueme, activa la campanita, hoy les traigo, en este video, sin más preámbulos, gracias por ver";

function ChannelTab({ influencer }: { influencer: Influencer }) {
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState<"all" | "50" | "100">("50");
  const [ignore, setIgnore] = useState(DEFAULT_IGNORE);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setProgress(0); setStage("Iniciando…");
    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencer_id: influencer.id,
        source_type: "channel",
        url,
        limit: limit === "all" ? 200 : Number(limit),
      }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const j = JSON.parse(line.slice(5).trim());
        if (j.stage) { setStage(j.stage); setProgress(j.progress); }
        if (j.done) { setStage(j.message); setProgress(100); }
      }
    }
    setRunning(false);
    setIgnore(ignore);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
        ⚠️ Para mejores resultados, procesa solo videos donde el influencer habla principalmente solo: vlogs, tutoriales o Q&As. Evita sketches o videos grupales.
      </div>
      <p className="text-xs text-muted-foreground">Ejemplo: https://youtube.com/@nombre-del-canal</p>
      <input className="input" placeholder="URL del canal" value={url} onChange={(e) => setUrl(e.target.value)} />
      <select className="input" value={limit} onChange={(e) => setLimit(e.target.value as any)}>
        <option value="all">Todos los videos</option>
        <option value="50">Últimos 50</option>
        <option value="100">Últimos 100</option>
      </select>
      <Field label="Palabras a ignorar">
        <textarea className="input min-h-[60px]" value={ignore} onChange={(e) => setIgnore(e.target.value)} />
      </Field>
      <button onClick={run} disabled={running || !url} className="btn-primary">Procesar canal</button>
      {running || progress > 0 ? (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{stage}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          🎬 Aún no has procesado videos. Empieza pegando la URL de un canal.
        </div>
      )}
    </div>
  );
}

function VideoTab({ influencer }: { influencer: Influencer }) {
  const [url, setUrl] = useState("");
  const [ignore, setIgnore] = useState(DEFAULT_IGNORE);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  async function run() {
    setRunning(true);
    await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ influencer_id: influencer.id, source_type: "video", url }),
    });
    setRunning(false); setDone(true);
    setIgnore(ignore);
  }
  return (
    <div className="space-y-4">
      <input className="input" placeholder="URL del video" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Field label="Palabras a ignorar">
        <textarea className="input min-h-[60px]" value={ignore} onChange={(e) => setIgnore(e.target.value)} />
      </Field>
      <button onClick={run} disabled={running || !url} className="btn-primary">Procesar video</button>
      {done && <p className="text-sm text-emerald-600">✅ Video procesado (simulación MVP).</p>}
    </div>
  );
}

function ManualTab({ influencer }: { influencer: Influencer }) {
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState("es");
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["transcripts", influencer.id],
    queryFn: () => listInfluencerTranscripts({ data: { influencer_id: influencer.id } }),
  });

  async function run() {
    setRunning(true); setMsg(null);
    const res = await fetch("/api/ingest-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencer_id: influencer.id,
        text,
        source: title || "Transcripción",
        language: lang,
        kind: "transcript",
      }),
    });
    const j = await res.json();
    setRunning(false);
    if (j.error) { setMsg(j.error); return; }
    setMsg(`✅ Transcripción procesada — ${j.fragments} fragmentos indexados`);
    setText(""); setTitle("");
    qc.invalidateQueries({ queryKey: ["transcripts", influencer.id] });
  }

  const estFragments = Math.max(1, Math.ceil(text.split(/\s+/).length / 380));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        💡 Obtén transcripciones de YouTube con <a href="https://tactiq.io" target="_blank" rel="noreferrer" className="underline">Tactiq</a> o <a href="https://downsub.com" target="_blank" rel="noreferrer" className="underline">Downsub</a> y pégalas aquí.
      </div>
      <input className="input" placeholder="Título o fuente" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
        <option value="es">Español</option>
        <option value="en">Inglés</option>
        <option value="pt">Portugués</option>
      </select>
      <textarea className="input min-h-[200px]" placeholder="Pega aquí la transcripción…" value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs text-muted-foreground">{text.length} caracteres · ~{estFragments} fragmentos</p>
      <button onClick={run} disabled={running || text.length < 20} className="btn-primary">{running ? "Procesando…" : "Procesar transcripción"}</button>
      {msg && <p className="text-sm">{msg}</p>}
      {data?.transcripts && data.transcripts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-medium">Transcripciones procesadas</h4>
          <ul className="space-y-2 text-sm">
            {data.transcripts.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.language} · {t.fragments} fragmentos</div>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InterviewTab({ influencer }: { influencer: Influencer }) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const q = INTERVIEW_QUESTIONS[step];

  async function submit(skip = false) {
    if (!skip && answer.trim().length < 5) return;
    setSubmitting(true);
    if (!skip) {
      await fetch("/api/ingest-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencer.id,
          text: `Pregunta: ${q}\nRespuesta: ${answer}`,
          source: `Entrevista IA · Q${step + 1}`,
          kind: "interview",
          question: q,
        }),
      });
    }
    setAnswer("");
    setSubmitting(false);
    if (step + 1 >= INTERVIEW_QUESTIONS.length) setDone(true);
    else setStep(step + 1);
  }

  function dictate() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "es-ES";
    rec.onresult = (e: any) => setAnswer((a) => (a ? a + " " : "") + e.results[0][0].transcript);
    rec.start();
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500 text-white">✓</div>
        <h3 className="mt-4 text-xl font-semibold">¡Entrevista completada!</h3>
        <p className="mt-2 text-sm text-emerald-900">Tu clon ya tiene contexto suficiente para comenzar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">10 preguntas base · ~15 minutos · Personalidad · Temas · Filosofía · Estilo · Logros</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${((step + 1) / INTERVIEW_QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Pregunta {step + 1} de {INTERVIEW_QUESTIONS.length}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-base font-medium">{q}</p>
        <textarea className="input mt-3 min-h-[120px]" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Tu respuesta…" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => submit(false)} disabled={submitting || answer.trim().length < 5} className="btn-primary">{submitting ? "Guardando…" : "Siguiente"}</button>
          <button onClick={dictate} className="btn-secondary">🎙 Dictar</button>
          <button onClick={() => submit(true)} className="text-sm text-muted-foreground hover:text-foreground">Saltar esta pregunta →</button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsSection({ influencer }: { influencer: Influencer }) {
  const { data } = useQuery({
    queryKey: ["analytics", influencer.id],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("conversations")
        .select("session_id, messages, created_at")
        .eq("influencer_id", influencer.id)
        .limit(1000);
      return rows ?? [];
    },
  });
  const rows = data ?? [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  let totalConvs = rows.length;
  let msgsToday = 0, msgsYesterday = 0;
  const sessions = new Set<string>();
  let totalMsgs = 0;
  const hourly = Array(24).fill(0);
  const days = Array(7).fill(0);
  const limitReachedSessions = new Set<string>();
  const perSession = new Map<string, number>();
  const questionCount = new Map<string, number>();

  for (const r of rows) {
    sessions.add(r.session_id);
    const msgs = (r.messages as { role: string; content: string; ts: number }[]) ?? [];
    totalMsgs += msgs.length;
    let userCountInSession = 0;
    for (const m of msgs) {
      if (m.role !== "user") continue;
      userCountInSession++;
      const d = new Date(m.ts ?? r.created_at);
      hourly[d.getHours()]++;
      if (d >= today) msgsToday++;
      else if (d >= yesterday && d < today) msgsYesterday++;
      const dayIdx = Math.floor((today.getTime() - new Date(d.toDateString()).getTime()) / 86400000);
      if (dayIdx >= 0 && dayIdx < 7) days[6 - dayIdx]++;
      const key = m.content.trim().toLowerCase().slice(0, 60);
      if (key.endsWith("?") || key.startsWith("¿") || key.includes("?")) {
        questionCount.set(key, (questionCount.get(key) ?? 0) + 1);
      }
    }
    perSession.set(r.session_id, (perSession.get(r.session_id) ?? 0) + userCountInSession);
    if (userCountInSession >= 50) limitReachedSessions.add(r.session_id);
  }
  const avgMsgsSession = sessions.size ? Math.round((totalMsgs / sessions.size) * 10) / 10 : 0;
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const topQuestions = [...questionCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxQ = topQuestions[0]?.[1] ?? 1;
  const maxDay = Math.max(1, ...days);
  const maxHour = Math.max(1, ...hourly);

  const bucketCounts = { "1-3": 0, "4-10": 0, "11-25": 0, "26-50": 0 };
  for (const c of perSession.values()) {
    if (c <= 3) bucketCounts["1-3"]++;
    else if (c <= 10) bucketCounts["4-10"]++;
    else if (c <= 25) bucketCounts["11-25"]++;
    else bucketCounts["26-50"]++;
  }
  const maxBucket = Math.max(1, ...Object.values(bucketCounts));
  const dominantBucket = Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "1-3";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Analytics</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Conversaciones totales" value={totalConvs} />
        <StatCard label="Mensajes hoy" value={msgsToday} delta={msgsToday - msgsYesterday} />
        <StatCard label="Usuarios únicos" value={sessions.size} />
        <StatCard label="Mensajes / sesión" value={avgMsgsSession} />
        <StatCard label="Hora pico" value={`${peakHour.toString().padStart(2, "0")}:00`} />
        <StatCard label="Límite alcanzado" value={limitReachedSessions.size} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="mb-4 text-sm font-medium">Mensajes últimos 7 días</h4>
        <div className="flex h-32 items-end gap-2">
          {days.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(v / maxDay) * 100}%`,
                  background: i === 6 ? "var(--color-primary)" : "var(--color-primary-soft)",
                  minHeight: 4,
                }}
              />
              <span className="text-xs text-muted-foreground">{i === 6 ? "Hoy" : `-${6 - i}d`}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-3 text-sm font-medium">Preguntas frecuentes</h4>
          {topQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún sin preguntas registradas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topQuestions.map(([q, n]) => (
                <li key={q}>
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="truncate">{q}</span>
                    <span className="text-muted-foreground">{n}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maxQ) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="mb-3 text-sm font-medium">Hora pico de actividad</h4>
          <div className="space-y-1 text-xs">
            {hourly.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-10 text-muted-foreground">{i.toString().padStart(2, "0")}h</span>
                <div className="flex-1 rounded-full bg-muted">
                  <div className="h-2 rounded-full" style={{ width: `${(v / maxHour) * 100}%`, background: i === peakHour ? "var(--color-primary)" : "var(--color-primary-soft)" }} />
                </div>
                <span className="w-6 text-right text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="mb-3 text-sm font-medium">Duración de conversaciones</h4>
        <div className="space-y-2 text-sm">
          {Object.entries(bucketCounts).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-16 text-muted-foreground">{k} msg</span>
              <div className="flex-1 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(v / maxBucket) * 100}%`, opacity: k === dominantBucket ? 1 : 0.5 }} />
              </div>
              <span className="w-8 text-right text-muted-foreground">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          💡 La mayoría de las conversaciones duran <strong className="text-foreground">{dominantBucket}</strong> mensajes.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, delta }: { label: string; value: number | string; delta?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {typeof delta === "number" && (
        <div className={`mt-1 text-xs ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)} vs ayer
        </div>
      )}
    </div>
  );
}
