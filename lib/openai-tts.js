/**
 * Call OpenAI TTS API with streaming playback via MediaSource Extensions.
 * Falls back to blob-based approach if MSE is not supported.
 * MSE streaming uses audio/mpeg (MP3) — widely supported in Chrome.
 * Note: OpenAI's 'opus' format returns OGG/Opus which MSE does not support.
 */

import { withRetry } from './retry.js';

const MIME_TYPE = 'audio/mpeg';
const TIMEOUT_MSG = 'TTS request timed out after 60 seconds. Check your network connection.';

/**
 * Shared fetch + error handling for TTS requests.
 * Returns the Response object on success.
 */
async function fetchTTS(apiKey, text, model, voice, format) {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/audio/speech', {
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
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') throw new Error(TIMEOUT_MSG);
      throw e;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const status = response.status;
      const err = new Error(
        status === 401 ? 'Invalid API key.' :
        status === 429 ? 'Rate limited. Please wait and try again.' :
        status === 402 || status === 403 ? 'TTS quota exceeded. Check your OpenAI billing.' :
        await getErrorMessage(response, status)
      );
      err.statusCode = status;
      throw err;
    }

    return response;
  });
}

async function getErrorMessage(response, status) {
  let message = response.statusText;
  try {
    const errBody = await response.json();
    if (errBody?.error?.message) message = errBody.error.message;
  } catch { /* ignore parse errors */ }
  return `TTS API error (${status}): ${message}`;
}

/**
 * Blob-based TTS (legacy fallback). Returns { audio, cleanup, blob? }.
 */
async function blobTTS(apiKey, text, model, voice, opts = {}) {
  const response = await fetchTTS(apiKey, text, model, voice, 'mp3');

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);

  const cleanup = () => URL.revokeObjectURL(audioUrl);
  const result = { audio, cleanup };
  if (opts.collectBlob) result.blob = blob;
  return result;
}

/**
 * Streaming TTS via MediaSource Extensions. Returns { audio, cleanup, blob? }.
 * Audio begins playing as soon as the browser has enough data (canplay event).
 */
async function mseTTS(apiKey, text, model, voice, opts = {}) {
  const response = await fetchTTS(apiKey, text, model, voice, 'mp3');

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
    URL.revokeObjectURL(msUrl);
  };

  // Collect chunks for blob if requested
  const collectBlob = opts.collectBlob;
  const blobChunks = collectBlob ? [] : null;

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

      // Declared before appendNext so the closure is safe
      let resolved = false;

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

      audio.addEventListener('canplay', () => {
        if (!resolved) {
          resolved = true;
          const result = { audio, cleanup };
          if (collectBlob) {
            // Return a getter that builds the blob from collected chunks
            Object.defineProperty(result, 'blob', {
              get: () => blobChunks ? new Blob(blobChunks, { type: MIME_TYPE }) : null,
            });
          }
          resolve(result);
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

          if (collectBlob && blobChunks) {
            blobChunks.push(new Uint8Array(value));
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
 * Main entry point. Returns { audio, cleanup, blob? }.
 * Uses MSE streaming when supported, otherwise falls back to blob download.
 * @param {string} apiKey
 * @param {string} text
 * @param {string} [model]
 * @param {string} [voice]
 * @param {object} [opts] - { collectBlob: bool }
 */
export async function streamTTS(apiKey, text, model = 'tts-1', voice = 'nova', opts = {}) {
  if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MIME_TYPE)) {
    return mseTTS(apiKey, text, model, voice, opts);
  }
  return blobTTS(apiKey, text, model, voice, opts);
}

// Keep legacy export for backwards compatibility
export { streamTTS as textToSpeech };
