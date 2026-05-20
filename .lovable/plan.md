# Project AlterEgo — Plan de implementación

Plataforma de réplicas conversacionales de influencers con chat de texto, llamada de voz en tiempo real y dashboard de entrenamiento. Diseño limpio estilo Apple/Linear con acento púrpura `#6C47FF`.

## Fases

### Fase 1 — Fundación (Cloud + diseño + datos)
- Activar **Lovable Cloud** (Supabase) para DB, Storage, Edge Functions y Secrets.
- Configurar `OPENAI_API_KEY` como secret.
- Migración SQL: extensión `vector`, tablas `influencers`, `videos`, `chunks`, `conversations`, función RPC `match_chunks`, bucket `influencer-photos` con RLS público.
- Seed de los 2 influencers (Alex Rivera, Ibai Llanos).
- Sistema de diseño en `src/styles.css`: tokens oklch (fondo blanco, acento púrpura), tipografía Inter, radios suaves, sombras sutiles.

### Fase 2 — Experiencia del fan
- `/` Home: navbar "AlterEgo" con punto púrpura, hero centrado, grid de 2 cards cargadas desde Supabase (avatar/iniciales, nombre, bio, badge).
- `/:slug` Landing: skeleton loaders, hero con avatar + tagline + bio, CTA "Hablar con [Nombre]", stats reales (count de videos y chunks), gradiente radial sutil.
- `/:slug/chat`:
  - Header sticky con avatar + nombre + badge "En línea".
  - Burbujas (clon izquierda gris, usuario derecha púrpura).
  - Streaming token-by-token vía SSE.
  - Typing animation (3 puntos).
  - 3-4 sugerencias rápidas que desaparecen tras el primer mensaje.
  - Contador "X mensajes restantes hoy" (límite 50/IP/día).
  - LocalStorage `alterego_chat_<slug>_<session_id>` (máx 50 mensajes).
  - Textarea auto-expandible (máx 5 líneas).
  - Botones: micrófono (Web Speech API dictado), broadcast (cuando vacío) que abre llamada, enviar (cuando hay texto).
- **Llamada de voz fullscreen** (overlay púrpura):
  - SpeechRecognition continuo.
  - Estados: Escuchando / Pensando / Hablando.
  - TTS por frases (corta en `. ? ! ,`) para baja latencia.
  - Interrupción: si el usuario habla → `speechSynthesis.cancel()`.
  - Silencio 2.5s antes de procesar.
  - Botón colgar limpia TTS + SpeechRecognition.
  - Indicador pulsante.

### Fase 3 — Backend de IA
- Server route `POST /api/chat` (TanStack server route, no Edge Functions):
  - Rate limit 50 msg/día por hash de IP (tabla `conversations`).
  - Embedding del mensaje con `text-embedding-3-small` (1536 dims).
  - Búsqueda top-5 chunks por cosine similarity filtrada por `influencer_id`.
  - Prompt con system + contexto RAG + historial últimos 8 + mensaje.
  - GPT-4o stream → SSE al cliente.
  - Persistencia asíncrona de la conversación.
- `POST /api/ingest-text`: chunking ~500 tokens con overlap 50 → embeddings → insert en `chunks` con `influencer_id`.
- `POST /api/ingest`: pipeline simulado con eventos SSE (canal/video YouTube — simulado en MVP).

### Fase 4 — Dashboard `/dashboard`
- Layout: sidebar fijo 220px desktop / hamburger móvil.
- Selector de influencer (dropdown con avatar + nombre + slug + badge, checkmark activo).
- Badge contextual "Todos los cambios aplican solo a [Nombre]".
- **Perfil**: editar nombre, slug, foto (upload a Storage con validación JPG/PNG, ≤2MB, ≥400×400 cuadrada), tagline, bio, color acento, badge.
- **Entrenar Clon** (4 pestañas):
  1. Canal completo: URL + dropdown cantidad + palabras a ignorar pre-rellenas + barra de progreso SSE + tabla de videos.
  2. Video individual.
  3. Transcripción manual: info box con links Tactiq/Downsub, idioma, textarea con contador caracteres/fragmentos, lista de transcripciones procesadas.
  4. Entrevista IA: 10 preguntas base + hasta 3 de seguimiento (generadas por IA), micrófono, badge "Seguimiento", saltar pregunta, pantalla de éxito; respuestas se guardan como chunks.
- **Analytics**: 6 cards (conversaciones, mensajes hoy, usuarios únicos, mensajes/sesión, hora pico, límite alcanzado), gráfica de barras 7 días, preguntas frecuentes con barra de popularidad, hora pico horizontal, duración de conversaciones con insight.

### Fase 5 — Pulido
- Sitemap + robots.txt.
- SEO en cada ruta (head con title/description/og).
- Verificar build limpio.

## Detalles técnicos

- **Stack**: TanStack Start v1 + React 19 + Tailwind v4 + shadcn. Server routes para chat y ingest (no Edge Functions).
- **DB**: pgvector con `vector(1536)`, función RPC `match_chunks(query_embedding, influencer_id, match_count)` con índice HNSW cosine.
- **Storage**: bucket público `influencer-photos`.
- **Secrets**: `OPENAI_API_KEY` server-side; claves Supabase ya provisionadas por Cloud.
- **Rate limit**: hash SHA-256 de IP + conteo de filas `conversations` del día.
- **Voz**: Web Speech API nativo (SpeechRecognition + SpeechSynthesis) — sin ElevenLabs.
- **YouTube ingest**: simulado en MVP (estados SSE falsos + chunks dummy).

## Fuera del MVP (no se construye)
Auth, pagos, ElevenLabs/Whisper, avatar animado, crear/eliminar influencers desde dashboard, fine-tuning, app nativa, ingesta real de YouTube, auto-sync.
