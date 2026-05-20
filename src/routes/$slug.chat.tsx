import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Avatar, Logo, PulseDot, Badge } from "@/components/brand";
import { getInfluencerBySlug } from "@/lib/influencer.functions";
import { QUICK_SUGGESTIONS, RATE_LIMIT_PER_DAY } from "@/lib/influencer";
import { Mic, Send, Radio, PhoneOff, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/$slug/chat")({
  head: ({ params }) => ({ meta: [{ title: `Chat con ${params.slug} · AlterEgo` }] }),
  loader: ({ params }) => getInfluencerBySlug({ data: { slug: params.slug } }),
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; content: string };

function ChatPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery({
    queryKey: ["influencer", slug],
    queryFn: () => getInfluencerBySlug({ data: { slug } }),
    initialData: Route.useLoaderData(),
  });
  const navigate = useNavigate();
  const inf = data.influencer;

  const [sessionId] = useState(() => {
    if (typeof window === "undefined") return "ssr";
    const key = `alterego_session_${slug}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  });

  const storageKey = `alterego_chat_${slug}_${sessionId}`;
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number>(RATE_LIMIT_PER_DAY);
  const [callOpen, setCallOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, storageKey]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const max = 5 * 24;
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, max)}px`;
  }, [input]);

  if (!inf) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Link to="/" className="text-primary">Volver al inicio</Link>
      </div>
    );
  }

  async function send(text: string) {
    if (!text.trim() || streaming || !inf) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          session_id: sessionId,
          influencer_id: inf.id,
          history: messages.slice(-16),
        }),
      });
      const rem = res.headers.get("X-Messages-Remaining");
      if (rem) setRemaining(Number(rem));
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: "Error" }));
        setMessages([
          ...history,
          { role: "assistant", content: j.error || "No pude responder ahora." },
        ]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]" || !payload) continue;
          try {
            const j = JSON.parse(payload);
            if (j.delta) {
              assistantText += j.delta;
              setMessages((cur) => {
                const copy = [...cur];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStreaming(false);
    }
  }

  function dictate() {
    const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta dictado por voz.");
      return;
    }
    const rec = new SR();
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.onresult = (e: { results: { 0: { transcript: string } }[] }) => {
      setInput((prev) => (prev ? prev + " " : "") + e.results[0][0].transcript);
    };
    rec.start();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md shadow-[0_1px_0_0_var(--color-border)]">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/$slug" params={{ slug }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Volver
          </Link>
          <div className="flex items-center gap-2">
            <Avatar influencer={inf} size={28} />
            <span className="text-sm font-medium">{inf.name}</span>
            <Badge variant="success">
              <PulseDot /> En línea
            </Badge>
          </div>
          <Logo className="text-sm" />
        </div>
      </header>

      <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="mt-8 text-center">
            <Avatar influencer={inf} size={72} />
            <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">
              Pregúntale lo que quieras a {inf.name}. Aquí van algunas ideas:
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {(QUICK_SUGGESTIONS[slug] ?? QUICK_SUGGESTIONS.default).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start gap-2"}`}>
                {m.role === "assistant" && <Avatar influencer={inf} size={28} />}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted text-foreground"
                  }`}
                >
                  {m.content || (
                    <span className="flex items-center gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-soft transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
            <button
              onClick={dictate}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dictar"
            >
              <Mic className="size-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={`Escribe a ${inf.name}…`}
              className="flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
              style={{ maxHeight: 120 }}
            />
            {input.trim() ? (
              <button
                onClick={() => send(input)}
                disabled={streaming}
                className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            ) : (
              <button
                onClick={() => setCallOpen(true)}
                className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
                aria-label="Llamada de voz"
              >
                <Radio className="size-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {remaining} mensajes restantes hoy
          </p>
        </div>
      </div>

      {callOpen && (
        <VoiceCall
          influencer={inf}
          sessionId={sessionId}
          baseHistory={messages}
          onClose={() => setCallOpen(false)}
        />
      )}
    </div>
  );
}

function VoiceCall({
  influencer,
  sessionId,
  baseHistory,
  onClose,
}: {
  influencer: { id: string; name: string; photo_url: string | null; accent_color: string | null };
  sessionId: string;
  baseHistory: Msg[];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"listening" | "thinking" | "speaking">("listening");
  const historyRef = useRef<Msg[]>(baseHistory.slice(-8));
  const recRef = useRef<any>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef<string>("");
  const speakingRef = useRef(false);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta llamadas de voz.");
      onClose();
      return;
    }
    const rec = new SR();
    rec.lang = "es-ES";
    rec.continuous = true;
    rec.interimResults = true;
    recRef.current = rec;

    rec.onresult = (e: any) => {
      if (speakingRef.current) {
        window.speechSynthesis.cancel();
        speakingRef.current = false;
      }
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        interim += e.results[i][0].transcript;
      }
      transcriptRef.current = interim;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        const final = transcriptRef.current.trim();
        if (final) processTurn(final);
        transcriptRef.current = "";
      }, 2500);
    };
    rec.onerror = (e: any) => console.warn("rec error", e);
    rec.onend = () => {
      // Chrome stops recognition after ~60s; restart while the call is active.
      if (recRef.current) {
        try { rec.start(); } catch { /* already running */ }
      }
    };
    rec.start();

    return () => {
      recRef.current = null;
      try { rec.stop(); } catch { /* */ }
      window.speechSynthesis.cancel();
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processTurn(text: string) {
    setStatus("thinking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          influencer_id: influencer.id,
          history: historyRef.current,
        }),
      });
      if (!res.ok || !res.body) {
        setStatus("listening");
        return;
      }
      historyRef.current = [...historyRef.current, { role: "user", content: text }];
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sentence = "";
      let full = "";
      setStatus("speaking");
      speakingRef.current = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]" || !payload) continue;
          try {
            const j = JSON.parse(payload);
            const d = j.delta as string | undefined;
            if (!d) continue;
            sentence += d;
            full += d;
            if (/[.?!,]\s*$/.test(sentence)) {
              speak(sentence.trim());
              sentence = "";
            }
          } catch { /* */ }
        }
      }
      if (sentence.trim()) speak(sentence.trim());
      historyRef.current = [...historyRef.current, { role: "assistant" as const, content: full }].slice(-16);
    } finally {
      // status reverts when speech ends
      setTimeout(() => {
        if (!speakingRef.current) setStatus("listening");
      }, 500);
    }
  }

  function speak(t: string) {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "es-ES";
    u.rate = 1.05;
    u.onend = () => {
      if (!window.speechSynthesis.speaking) {
        speakingRef.current = false;
        setStatus("listening");
      }
    };
    window.speechSynthesis.speak(u);
  }

  function hangUp() {
    recRef.current = null;
    try { recRef.current?.stop(); } catch { /* */ }
    window.speechSynthesis.cancel();
    onClose();
  }

  const statusLabel =
    status === "listening" ? "Escuchando..." : status === "thinking" ? "Pensando..." : "Hablando...";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-primary p-8 text-primary-foreground">
      <div className="text-sm font-medium uppercase tracking-widest opacity-80">Llamada en vivo</div>
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="pulse-ring absolute inset-0 rounded-full bg-white/20" />
          <div className="relative">
            <Avatar influencer={influencer as any} size={160} />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-semibold">{influencer.name}</h2>
          <p className="mt-2 text-lg opacity-90">{statusLabel}</p>
        </div>
      </div>
      <button
        onClick={hangUp}
        className="grid size-16 place-items-center rounded-full bg-red-500 text-white shadow-card transition-transform hover:scale-105"
        aria-label="Colgar"
      >
        <PhoneOff className="size-6" />
      </button>
    </div>
  );
}
