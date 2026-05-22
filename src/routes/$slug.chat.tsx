import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Avatar, Logo, PulseDot, Badge } from "@/components/brand";
import { getInfluencerBySlug } from "@/lib/influencer.functions";
import { QUICK_SUGGESTIONS, RATE_LIMIT_PER_DAY } from "@/lib/influencer";
import { Mic, Send, Radio, PhoneOff, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/$slug/chat")({
  head: ({ params }) => ({ meta: [{ title: `Chat con ${params.slug} · AlterEgo` }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    call: search.call === 1 || search.call === "1" ? 1 : undefined,
  }),
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
          onClose={() => setCallOpen(false)}
        />
      )}
    </div>
  );
}

type CallStatus = "connecting" | "listening" | "thinking" | "speaking" | "error";

function VoiceCall({
  influencer,
  onClose,
}: {
  influencer: { id: string; name: string; photo_url: string | null; accent_color: string | null };
  onClose: () => void;
}) {
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const isMountedRef = useRef(true);
  const statusRef = useRef<CallStatus>("connecting");

  const setCallStatus = (s: CallStatus) => {
    statusRef.current = s;
    if (isMountedRef.current) setStatus(s);
  };

  function pcm16ToAudioBuffer(ctx: AudioContext, data: ArrayBuffer): AudioBuffer {
    const pcm = new Int16Array(data);
    const float32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768;
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return buffer;
  }

  function playNext() {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    const buffer = audioQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    isPlayingRef.current = true;
    setCallStatus("speaking");
    source.onended = () => {
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) playNext();
      else setCallStatus("listening");
    };
    source.start();
  }

  const hangUp = useCallback(() => {
    isMountedRef.current = false;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { processorRef.current?.disconnect(); } catch { /* */ }
    try { captureCtxRef.current?.close(); } catch { /* */ }
    try { playbackCtxRef.current?.close(); } catch { /* */ }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* */ }
      wsRef.current = null;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    isMountedRef.current = true;

    async function startCall() {
      try {
        const tokenRes = await fetch("/api/live-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ influencer_id: influencer.id }),
        });
if (!tokenRes.ok) throw new Error("No se pudo iniciar la llamada");
const { token, apiKey, model, mode } = (await tokenRes.json()) as {
  token?: string; apiKey?: string; model?: string; mode?: string;
};
if (!token && !apiKey) throw new Error("No se pudo autenticar con el servicio de voz");

const liveModel = model ?? "gemini-live-2.5-flash-preview";
const WS_URL = mode === "apikey" && apiKey
  ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`
  : `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = async () => {
          if (!isMountedRef.current) return;
          ws.send(JSON.stringify({
            setup: {
              model: `models/${liveModel}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
                },
              },
            },
          }));

          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
            mediaStreamRef.current = stream;

            const captureCtx = new AudioContext({ sampleRate: 16000 });
            captureCtxRef.current = captureCtx;
            playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });

            const source = captureCtx.createMediaStreamSource(stream);
            const processor = captureCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const float32 = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(float32.length);
              for (let i = 0; i < float32.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
              }
              const bytes = new Uint8Array(pcm16.buffer);
              let bin = "";
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              const base64Audio = btoa(bin);
              ws.send(JSON.stringify({
                realtimeInput: {
                  audio: { mimeType: "audio/pcm;rate=16000", data: base64Audio },
                },
              }));
            };

            source.connect(processor);
            processor.connect(captureCtx.destination);

            setCallStatus("listening");
          } catch {
            setErrorMsg("No se pudo acceder al micrófono. Revisa los permisos.");
            setCallStatus("error");
          }
        };

        ws.onmessage = async (event) => {
          if (!isMountedRef.current) return;
          try {
            const raw = typeof event.data === "string"
              ? event.data
              : await (event.data as Blob).text();
            const data = JSON.parse(raw);

            if (data.serverContent?.generationComplete === false) {
              if (statusRef.current !== "speaking") setCallStatus("thinking");
            }

            const parts = data.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
                const rawBase64 = part.inlineData.data as string;
                const binary = atob(rawBase64);
                const buffer = new ArrayBuffer(binary.length);
                const view = new Uint8Array(buffer);
                for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
                if (playbackCtxRef.current) {
                  audioQueueRef.current.push(
                    pcm16ToAudioBuffer(playbackCtxRef.current, buffer)
                  );
                  playNext();
                }
              }
            }

            if (data.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setCallStatus("listening");
            }
          } catch {
            /* ignore */
          }
        };

        ws.onerror = () => {
          if (!isMountedRef.current) return;
          setErrorMsg("Error de conexión con el servicio de voz.");
          setCallStatus("error");
        };

        ws.onclose = () => {
          if (!isMountedRef.current) return;
          if (statusRef.current !== "connecting" && statusRef.current !== "error") {
            setErrorMsg("La llamada se desconectó.");
            setCallStatus("error");
          }
        };
      } catch (err) {
        if (!isMountedRef.current) return;
        setErrorMsg(err instanceof Error ? err.message : "No se pudo iniciar la llamada");
        setCallStatus("error");
      }
    }

    startCall();

    return () => {
      isMountedRef.current = false;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      try { processorRef.current?.disconnect(); } catch { /* */ }
      try { captureCtxRef.current?.close(); } catch { /* */ }
      try { playbackCtxRef.current?.close(); } catch { /* */ }
      try { wsRef.current?.close(); } catch { /* */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel: Record<CallStatus, string> = {
    connecting: "Conectando...",
    listening: "Escuchando...",
    thinking: "Pensando...",
    speaking: "Hablando...",
    error: errorMsg || "Error de conexión",
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-primary p-8 text-primary-foreground">
      <div className="text-sm font-medium uppercase tracking-widest opacity-80">
        Llamada en vivo · Gemini
      </div>
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          {(status === "listening" || status === "speaking" || status === "thinking") && (
            <div className="pulse-ring absolute inset-0 rounded-full bg-white/20" />
          )}
          <div className="relative">
            <Avatar influencer={influencer as any} size={160} />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-semibold">{influencer.name}</h2>
          <p className="mt-2 text-lg opacity-90">{statusLabel[status]}</p>
          {status === "error" && (
            <p className="mt-2 max-w-xs text-sm opacity-75">{errorMsg}</p>
          )}
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
