import { streamTTS } from '../lib/openai-tts.js';
import { getCachedAudio, cacheAudio } from '../lib/audio-cache.js';

let currentAudio = null;
let currentCleanup = null;
let progressInterval = null;
let playing = false;
let paused = false;

// Chunk queue state
let chunks = [];
let currentChunkIndex = 0;
let completedChunkDurations = 0;
let prefetchedResult = null;
let prefetchedCleanup = null;
let collectedBlobs = [];
let cacheKey = null;
let ttsMetadata = {};

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function startProgressReporting() {
  stopProgressReporting();
  progressInterval = setInterval(() => {
    if (!currentAudio) return;
    const currentTime = completedChunkDurations + (currentAudio.currentTime || 0);
    let duration = 0;
    if (currentAudio.duration && isFinite(currentAudio.duration)) {
      duration = completedChunkDurations + currentAudio.duration;
    }
    broadcast({
      type: 'OFFSCREEN_PROGRESS',
      currentTime,
      duration,
      currentChunk: currentChunkIndex + 1,
      totalChunks: chunks.length,
    });
  }, 500);
}

function stopProgressReporting() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function cleanup() {
  stopProgressReporting();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  if (prefetchedResult) {
    if (prefetchedCleanup) prefetchedCleanup();
    prefetchedResult = null;
    prefetchedCleanup = null;
  }
  playing = false;
  paused = false;
  chunks = [];
  currentChunkIndex = 0;
  completedChunkDurations = 0;
  collectedBlobs = [];
  cacheKey = null;
  ttsMetadata = {};
}

async function prefetchChunk(index, apiKey, ttsModel, voice) {
  if (index >= chunks.length) return;
  try {
    const result = await streamTTS(apiKey, chunks[index], ttsModel, voice, { collectBlob: true });
    prefetchedResult = result;
    prefetchedCleanup = result.cleanup;
  } catch (e) {
    // Prefetch failure is non-fatal; we'll fetch on demand
    prefetchedResult = null;
    prefetchedCleanup = null;
  }
}

async function playChunk(index, apiKey, ttsModel, voice, playbackSpeed) {
  if (index >= chunks.length) {
    // All chunks done — cache if we have a key
    if (cacheKey && collectedBlobs.length > 0) {
      try {
        await cacheAudio(cacheKey, collectedBlobs, ttsMetadata);
      } catch (e) { /* cache failure is non-fatal */ }
    }
    cleanup();
    broadcast({ type: 'OFFSCREEN_DONE' });
    return;
  }

  currentChunkIndex = index;

  let audio, chunkCleanup, blob;
  try {
    // Use prefetched result if available for this chunk
    if (prefetchedResult && index > 0) {
      audio = prefetchedResult.audio;
      chunkCleanup = prefetchedCleanup;
      blob = prefetchedResult.blob;
      prefetchedResult = null;
      prefetchedCleanup = null;
    } else {
      const result = await streamTTS(apiKey, chunks[index], ttsModel, voice, { collectBlob: true });
      audio = result.audio;
      chunkCleanup = result.cleanup;
      blob = result.blob;
    }
  } catch (e) {
    cleanup();
    broadcast({ type: 'OFFSCREEN_ERROR', message: e.message });
    return;
  }

  if (currentCleanup) currentCleanup();
  currentAudio = audio;
  currentCleanup = chunkCleanup;
  playing = true;
  paused = false;

  if (playbackSpeed) {
    currentAudio.playbackRate = playbackSpeed;
  }

  // Collect blob for caching
  if (blob) {
    collectedBlobs.push(blob);
  }

  // Start prefetching next chunk
  if (index + 1 < chunks.length) {
    prefetchChunk(index + 1, apiKey, ttsModel, voice);
  }

  currentAudio.onended = () => {
    if (currentAudio && currentAudio.duration && isFinite(currentAudio.duration)) {
      completedChunkDurations += currentAudio.duration;
    }
    playChunk(index + 1, apiKey, ttsModel, voice, playbackSpeed);
  };

  currentAudio.onerror = () => {
    const mediaErr = currentAudio?.error;
    const detail = mediaErr
      ? `Audio playback failed (code ${mediaErr.code}).`
      : 'Audio playback failed.';
    cleanup();
    broadcast({ type: 'OFFSCREEN_ERROR', message: detail });
  };

  startProgressReporting();
  broadcast({ type: 'OFFSCREEN_STATUS', playing: true, paused: false });

  try {
    await currentAudio.play();
  } catch (err) {
    cleanup();
    broadcast({ type: 'OFFSCREEN_ERROR', message: `Audio playback failed: ${err.message}` });
  }
}

async function playFromCache(cachedData, playbackSpeed) {
  const blobs = cachedData.audioBlobs;
  chunks = blobs.map((_, i) => `chunk_${i}`); // placeholder chunk labels
  currentChunkIndex = 0;
  completedChunkDurations = 0;
  playing = true;
  paused = false;

  async function playCachedChunk(index) {
    if (index >= blobs.length) {
      cleanup();
      broadcast({ type: 'OFFSCREEN_DONE' });
      return;
    }
    currentChunkIndex = index;

    const audioUrl = URL.createObjectURL(blobs[index]);
    const audio = new Audio(audioUrl);
    const chunkCleanup = () => URL.revokeObjectURL(audioUrl);

    if (currentCleanup) currentCleanup();
    currentAudio = audio;
    currentCleanup = chunkCleanup;

    if (playbackSpeed) audio.playbackRate = playbackSpeed;

    audio.onended = () => {
      if (audio.duration && isFinite(audio.duration)) {
        completedChunkDurations += audio.duration;
      }
      playCachedChunk(index + 1);
    };

    audio.onerror = () => {
      cleanup();
      broadcast({ type: 'OFFSCREEN_ERROR', message: 'Cached audio playback failed.' });
    };

    startProgressReporting();
    broadcast({ type: 'OFFSCREEN_STATUS', playing: true, paused: false });

    try {
      await audio.play();
    } catch (err) {
      cleanup();
      broadcast({ type: 'OFFSCREEN_ERROR', message: `Audio playback failed: ${err.message}` });
    }
  }

  await playCachedChunk(0);
}

async function handlePlay(msg) {
  cleanup();

  const { ttsModel, voice, apiKey, playbackSpeed } = msg;
  cacheKey = msg.cacheKey || null;
  ttsMetadata = { url: msg.url || '', title: msg.title || '', ttsModel, voice };
  collectedBlobs = [];

  // Check cache first
  if (cacheKey) {
    try {
      const cached = await getCachedAudio(cacheKey);
      if (cached && cached.audioBlobs && cached.audioBlobs.length > 0) {
        broadcast({ type: 'OFFSCREEN_CACHED', cached: true });
        await playFromCache(cached, playbackSpeed);
        return;
      }
    } catch (e) { /* cache miss, proceed normally */ }
  }

  chunks = msg.chunks || [msg.cleanedText];
  await playChunk(0, apiKey, ttsModel, voice, playbackSpeed);
}

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'OFFSCREEN_TTS_PLAY':
      handlePlay(msg);
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_PAUSE':
      if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        paused = true;
        playing = false;
        broadcast({ type: 'OFFSCREEN_STATUS', playing: false, paused: true });
      }
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_RESUME':
      if (currentAudio && currentAudio.paused) {
        currentAudio.play().catch(() => {});
        paused = false;
        playing = true;
        broadcast({ type: 'OFFSCREEN_STATUS', playing: true, paused: false });
      }
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_STOP':
      cleanup();
      broadcast({ type: 'OFFSCREEN_STATUS', playing: false, paused: false });
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_SET_SPEED':
      if (currentAudio) {
        currentAudio.playbackRate = msg.speed;
      }
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_SEEK':
      if (currentAudio && isFinite(msg.time)) {
        currentAudio.currentTime = msg.time;
      }
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_GET_STATUS':
      sendResponse({ playing, paused });
      return false;

    case 'CLEAR_AUDIO_CACHE':
      import('../lib/audio-cache.js').then(mod => mod.clearCache())
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true; // async sendResponse

    default:
      return false;
  }
});
