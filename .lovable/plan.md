# Plan para reparar la llamada en tiempo real con Gemini Live

## Diagnóstico

Sí puedo intentarlo con una base técnica clara. El fallo no parece estar en el botón, sino en la integración Gemini Live:

1. El endpoint `/api/live-token` está creando el token efímero con un cuerpo REST incorrecto: la API de Google espera un `CreateAuthTokenRequest` con `authToken`, no el objeto plano actual.
2. El modelo usado está desactualizado frente a la documentación actual de Live API: usar `gemini-3.1-flash-live-preview`.
3. El cliente no debe recibir nunca `GEMINI_API_KEY` como fallback. Si falla el token efímero, debe devolver un error claro para no exponer la clave.
4. El formato WebSocket debe mantenerse en camelCase para JSON directo. El snake_case aplica a ejemplos de SDK/Python, no al mensaje raw del navegador.
5. La configuración de la llamada debe estar alineada entre el token efímero y el primer mensaje `setup` del WebSocket.

## Cambios a implementar

### 1. Corregir `/api/live-token`

- Usar `POST https://generativelanguage.googleapis.com/v1alpha/authTokens?key=...`.
- Enviar el body con esta forma conceptual:

```json
{
  "authToken": {
    "uses": 1,
    "expireTime": "...",
    "newSessionExpireTime": "...",
    "bidiGenerateContentSetup": {
      "model": "models/gemini-3.1-flash-live-preview",
      "generationConfig": {
        "responseModalities": ["AUDIO"],
        "speechConfig": {
          "voiceConfig": {
            "prebuiltVoiceConfig": { "voiceName": "Aoede" }
          }
        }
      },
      "systemInstruction": {
        "parts": [{ "text": "...instrucciones del influencer..." }]
      },
      "realtimeInputConfig": {
        "automaticActivityDetection": {
          "disabled": false,
          "silenceDurationMs": 1200,
          "prefixPaddingMs": 300
        },
        "activityHandling": "START_OF_ACTIVITY_INTERRUPTS",
        "turnCoverage": "TURN_INCLUDES_ONLY_ACTIVITY"
      }
    }
  }
}
```

- Devolver solo `{ token, model, expiresAt }`.
- Eliminar el fallback que devuelve `apiKey` al navegador.
- Incluir mensajes de error más útiles cuando Google rechace el token.

### 2. Corregir el WebSocket del navegador

- Usar exclusivamente:

```text
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=TOKEN
```

- Mantener el primer mensaje como `setup` en camelCase.
- Enviar `systemInstruction`, `generationConfig` y `realtimeInputConfig` con el mismo formato que la API referencia.
- Esperar `setupComplete` antes de empezar a capturar/enviar audio del micrófono.
- Mantener audio entrante como:

```json
{
  "realtimeInput": {
    "audio": {
      "mimeType": "audio/pcm;rate=16000",
      "data": "base64..."
    }
  }
}
```

### 3. Mejorar el error visible

- Si `/api/live-token` falla, mostrar el mensaje real: clave no configurada, token rechazado, permisos de micrófono o WebSocket cerrado.
- Añadir logs de diagnóstico seguros sin imprimir secretos.

### 4. Validación

- Verificar que `GEMINI_API_KEY` existe como secret.
- Revisar logs del servidor tras el cambio.
- Probar que el botón `Llamar a Ibai Llanos` abre la pantalla de llamada y que el flujo llega al menos hasta `setupComplete` antes de enviar audio.

## Resultado esperado

La opción de llamada dejará de fallar inmediatamente por token/modelo/formato. Si después aparece un error distinto de cuenta, permisos, cuota o disponibilidad regional de Gemini Live, quedará visible en pantalla y en logs para resolverlo sin adivinar.
