import { extractWithChat } from '../lib/openai-chat.js';
import { calculateCost } from '../lib/cost.js';
import { chunkText } from '../lib/chunker.js';
import { generateCacheKey, clearCache } from '../lib/audio-cache.js';
import { DEFAULTS, STATES, TTS_MAX_CHARS, GPT_INPUT_CAP, SUMMARY_PROMPT } from '../lib/constants.js';

let state = {
  status: STATES.IDLE,
  detail: '',
  usage: null,
  cost: null,
};

let settings = {};
let aborted = false;
let isRunning = false;

// Pre-fetch state
let prefetchedData = null;

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'apiKey', 'chatModel', 'ttsModel', 'voice', 'maxContentLength', 'blocklist',
  ]);
  const rawMax = parseInt(result.maxContentLength);
  return {
    apiKey: result.apiKey || '',
    chatModel: result.chatModel || DEFAULTS.chatModel,
    ttsModel: result.ttsModel || DEFAULTS.ttsModel,
    voice: result.voice || DEFAULTS.voice,
    maxContentLength: Number.isFinite(rawMax)
      ? Math.max(1000, Math.min(rawMax, 200000))
      : DEFAULTS.maxContentLength,
    blocklist: result.blocklist || '',
  };
}

function updateState(updates) {
  Object.assign(state, updates);
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    ...state,
  }).catch(() => {});
}

function sendError(code, message) {
  state.status = STATES.ERROR;
  state.detail = message;
  chrome.runtime.sendMessage({
    type: 'ERROR',
    code,
    message,
  }).catch(() => {});
}

function resetState() {
  state = {
    status: STATES.IDLE,
    detail: '',
    usage: null,
    cost: null,
  };
  aborted = false;
}

// Ensure offscreen document exists
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'TTS audio playback that survives popup close',
    });
  }
}

// Main pipeline
async function startReading(tabId, tabUrl, quickRead = false, summaryMode = false) {
  if (isRunning) return;
  isRunning = true;

  try {
    resetState();
    settings = await loadSettings();

    // Fire-and-forget: start loading offscreen document early so its script
    // is ready by the time we need it (extraction + GPT takes seconds)
    const offscreenReady = ensureOffscreen();

    // Check API key
    if (!settings.apiKey) {
      sendError('NO_API_KEY', 'No API key set. Open settings (gear icon) and enter your OpenAI API key.');
      return;
    }

    // Check blocklist and protocol
    if (tabUrl) {
      try {
        const url = new URL(tabUrl);

        if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol === 'about:') {
          sendError('BLOCKED_PAGE', 'Cannot read content from browser internal pages.');
          return;
        }

        if (settings.blocklist) {
          const blocked = settings.blocklist.split('\n').map(d => d.trim()).filter(Boolean);
          if (blocked.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) {
            sendError('BLOCKLISTED', 'This domain is in your blocklist.');
            return;
          }
        }
      } catch (e) {
        // Invalid URL -- proceed anyway
      }
    }

    let chatResult;
    let cleanedText;

    // Step 1: Extract content (use prefetched if available)
    let extracted;
    if (prefetchedData && prefetchedData.tabUrl === tabUrl && prefetchedData.extracted) {
      extracted = prefetchedData.extracted;
      prefetchedData = null;
    } else {
      prefetchedData = null;
      updateState({ status: STATES.EXTRACTING, detail: 'Grabbing page content...' });

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/content-script.js'],
        });
        extracted = results?.[0]?.result;
        if (aborted) return;
      } catch (e) {
        sendError('INJECTION_FAILED', 'Cannot access this page. It may be a protected browser page.');
        return;
      }
    }

    if (!extracted || extracted.error) {
      sendError('EXTRACTION_FAILED', extracted?.error || 'Failed to extract content from page.');
      return;
    }

    // Truncate if too long
    let rawContent = extracted.content;
    if (rawContent.length > settings.maxContentLength) {
      rawContent = rawContent.slice(0, settings.maxContentLength);
    }

    if (quickRead) {
      if (aborted) return;
      cleanedText = rawContent;
      if (!cleanedText || cleanedText.trim().length < 20) {
        sendError('EMPTY_RESULT', 'Nothing to read — the page seems empty.');
        return;
      }
      chatResult = { usage: { promptTokens: 0, completionTokens: 0 } };
    } else {
      // Cap content for GPT
      if (rawContent.length > GPT_INPUT_CAP) {
        rawContent = rawContent.slice(0, GPT_INPUT_CAP);
      }

      // Step 2: LLM extraction
      const statusDetail = summaryMode ? 'Summarizing key insights...' : 'Preparing your article...';
      updateState({ status: STATES.PROCESSING, detail: statusDetail });

      const chatOpts = {};
      if (summaryMode) {
        chatOpts.systemPrompt = SUMMARY_PROMPT;
      }
      chatOpts.onRetry = () => {
        updateState({ detail: 'Hmm, trying again...' });
      };

      try {
        chatResult = await extractWithChat(settings.apiKey, rawContent, settings.chatModel, chatOpts);
      } catch (e) {
        sendError('CHAT_ERROR', e.message);
        return;
      }

      if (aborted) return;

      cleanedText = chatResult.text;
      if (!cleanedText || cleanedText.length < 20) {
        sendError('EMPTY_RESULT', 'Nothing to read — couldn\'t find article content.');
        return;
      }
    }

    // Step 3: Chunk text for TTS
    const chunks = chunkText(cleanedText, TTS_MAX_CHARS);
    const ttsCharacters = cleanedText.length;

    // Step 4: Calculate cost
    const costInfo = calculateCost(
      settings.chatModel,
      settings.ttsModel,
      chatResult.usage,
      ttsCharacters,
    );

    // Step 5: Run cache key, speed lookup, and offscreen readiness in parallel
    const [cacheKey, speedResult] = await Promise.all([
      generateCacheKey(tabUrl || '', cleanedText).catch(() => null),
      chrome.storage.local.get(['playbackSpeed']),
      offscreenReady,
    ]);
    const playbackSpeed = speedResult.playbackSpeed || DEFAULTS.playbackSpeed;

    // Step 6: Send to offscreen for TTS + playback
    updateState({
      status: STATES.PLAYING,
      detail: chunks.length > 1 ? `Playing — part 1 of ${chunks.length}` : 'Playing',
      usage: chatResult.usage,
      cost: costInfo,
    });

    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_TTS_PLAY',
      chunks,
      cleanedText,
      ttsModel: settings.ttsModel,
      voice: settings.voice,
      apiKey: settings.apiKey,
      playbackSpeed,
      cacheKey,
      url: tabUrl,
    }).catch(() => {});
  } finally {
    isRunning = false;
  }
}

// Pre-fetch pipeline: extract page content only (no GPT call)
// This saves ~1-2s on Play by having raw content ready
async function prefetch(tabId, tabUrl) {
  try {
    settings = await loadSettings();

    let extracted;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content-script.js'],
      });
      extracted = results?.[0]?.result;
    } catch (e) {
      return;
    }

    if (!extracted || extracted.error) return;

    prefetchedData = { tabUrl, extracted };
  } catch (e) {
    prefetchedData = null;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'START_READING':
      startReading(msg.tabId, msg.tabUrl, msg.quickRead, msg.summaryMode);
      sendResponse({ ok: true });
      return false;

    case 'STOP':
      aborted = true;
      // Also stop offscreen audio
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' }).catch(() => {});
      updateState({ status: STATES.IDLE, detail: 'Stopped', usage: null, cost: null });
      sendResponse({ ok: true });
      return false;

    case 'GET_STATE':
      sendResponse({ ...state });
      return false;

    case 'PREFETCH':
      if (!isRunning && !prefetchedData) {
        prefetch(msg.tabId, msg.tabUrl);
      }
      sendResponse({ ok: true });
      return false;

    case 'OFFSCREEN_PAUSE':
    case 'OFFSCREEN_RESUME':
    case 'OFFSCREEN_SET_SPEED':
    case 'OFFSCREEN_SEEK':
      // Forward to offscreen document (no-op if offscreen doesn't exist)
      return false;

    case 'OFFSCREEN_GET_STATUS':
      // Service worker already tracks state — respond directly
      sendResponse({ playing: state.status === STATES.PLAYING, paused: state.status === STATES.PAUSED });
      return false;

    case 'CLEAR_AUDIO_CACHE':
      clearCache()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;

    case 'OFFSCREEN_DONE':
      updateState({ status: STATES.DONE, detail: 'All done!' });
      return false;

    case 'OFFSCREEN_ERROR':
      sendError('PLAYBACK_ERROR', msg.message);
      return false;

    case 'OFFSCREEN_STATUS':
      if (msg.playing) {
        state.status = STATES.PLAYING;
      } else if (msg.paused) {
        state.status = STATES.PAUSED;
        state.detail = 'Paused';
      }
      return false;

    case 'OFFSCREEN_PROGRESS':
      // Update detail with chunk info
      if (msg.totalChunks > 1) {
        state.detail = `Playing — part ${msg.currentChunk} of ${msg.totalChunks}`;
      }
      // Forward progress to popup
      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_PROGRESS',
        currentTime: msg.currentTime,
        duration: msg.duration,
        currentChunk: msg.currentChunk,
        totalChunks: msg.totalChunks,
      }).catch(() => {});
      return false;

    case 'OFFSCREEN_CACHED':
      // Forward cache hit status to popup
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_CACHED', cached: true }).catch(() => {});
      return false;

    default:
      return false;
  }
});

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  await ensureOffscreen();
  if (command === 'toggle-pause') {
    if (state.status === STATES.PAUSED) {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_RESUME' }).catch(() => {});
    } else if (state.status === STATES.PLAYING) {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_PAUSE' }).catch(() => {});
    }
  } else if (command === 'stop-playback') {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' }).catch(() => {});
    updateState({ status: STATES.IDLE, detail: 'Stopped', usage: null, cost: null });
  }
});
