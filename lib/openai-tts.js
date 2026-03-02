/**
 * Call OpenAI TTS API with streaming playback via MediaSource Extensions.
 * Falls back to blob-based approach if MSE is not supported.
 * MSE streaming uses audio/mpeg (MP3) — widely supported in Chrome.
 * Note: OpenAI's 'opus' format returns OGG/Opus which MSE does not support.
 */

const MIME_TYPE = 'audio/mpeg';
const TIMEOUT_MSG = 'TTS request timed out after 60 seconds. Check your network connection.';

/**
 * Shared fetch + error handling for TTS requests.
 * Returns the Response object on success.
 */
async function fetchTTS(apiKey, text, model, voice, format, signal) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: format,
    }),
    signal,
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error('Invalid API key.');
    if (status === 429) throw new Error('Rate limited. Please wait and try again.');
    if (status === 402 || status === 403) throw new Error('TTS quota exceeded. Check your OpenAI billing.');
    let message = response.statusText;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) message = errBody.error.message;
    } catch { /* ignore parse errors */ }
    throw new Error(`TTS API error (${status}): ${message}`);
  }

  return response;
}

/**
 * Blob-based TTS (legacy fallback). Returns { audio, cleanup }.
 */
async function blobTTS(apiKey, text, model, voice) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetchTTS(apiKey, text, model, voice, 'mp3', controller.signal);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(TIMEOUT_MSG);
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);

  const cleanup = () => URL.revokeObjectURL(audioUrl);
  return { audio, cleanup };
}

/**
 * Streaming TTS via MediaSource Extensions. Returns { audio, cleanup }.
 * Audio begins playing as soon as the browser has enough data (canplay event).
 */
async function mseTTS(apiKey, text, model, voice) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetchTTS(apiKey, text, model, voice, 'mp3', controller.signal);
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error(TIMEOUT_MSG);
    throw e;
  }

  // Headers received — clear the connection timeout.
  // The stream itself is protected by the reader cancellation in cleanup().
  clearTimeout(timeoutId);

  const mediaSource = new MediaSource();
  const msUrl = URL.createObjectURL(mediaSource);
  const audio = new Audio(msUrl);

  // Reader reference hoisted so cleanup() can cancel it
  let reader = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (reader) reader.cancel().catch(() => {});
    controller.abort(); // abort fetch if still in-flight
    URL.revokeObjectURL(msUrl);
  };

  return new Promise((resolve, reject) => {
    mediaSource.addEventListener('sourceopen', async () => {
      const sourceBuffer = mediaSource.addSourceBuffer(MIME_TYPE);
      reader = response.body.getReader();
      const queue = [];
      let streamDone = false;
      let streamEnded = false; // guard against double endOfStream()

      function tryEndStream() {
        if (streamEnded || mediaSource.readyState !== 'open') return;
        if (!sourceBuffer.updating && queue.length === 0 && streamDone) {
          streamEnded = true;
          mediaSource.endOfStream();
        }
      }

      function appendNext() {
        if (sourceBuffer.updating || queue.length === 0) return;
        try {
          sourceBuffer.appendBuffer(queue.shift());
        } catch (e) {
          if (!resolved) reject(new Error(`Audio buffer error: ${e.message}`));
        }
      }

      sourceBuffer.addEventListener('updateend', () => {
        if (queue.length > 0) {
          appendNext();
        } else {
          tryEndStream();
        }
      });

      sourceBuffer.addEventListener('error', () => {
        if (!resolved) reject(new Error('MSE SourceBuffer error during streaming.'));
      });

      // Resolve when the browser has enough data to begin playback
      let resolved = false;

      audio.addEventListener('canplay', () => {
        if (!resolved) {
          resolved = true;
          resolve({ audio, cleanup });
        }
      }, { once: true });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            streamDone = true;
            tryEndStream();
            break;
          }

          queue.push(value);
          appendNext();
        }
      } catch (e) {
        // reader.cancel() from cleanup triggers an abort — not an error
        if (cleaned) return;
        if (!resolved) {
          reject(e.name === 'AbortError' ? new Error(TIMEOUT_MSG) : e);
        }
      }
    });
  });
}

/**
 * Main entry point. Returns { audio, cleanup }.
 * Uses MSE streaming when supported, otherwise falls back to blob download.
 */
export async function streamTTS(apiKey, text, model = 'tts-1', voice = 'nova') {
  if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MIME_TYPE)) {
    return mseTTS(apiKey, text, model, voice);
  }
  return blobTTS(apiKey, text, model, voice);
}

// Keep legacy export for backwards compatibility
export { streamTTS as textToSpeech };
