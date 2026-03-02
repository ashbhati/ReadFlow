import { extractWithChat } from '../lib/openai-chat.js';
import { calculateCost } from '../lib/cost.js';
import { DEFAULTS, STATES, TTS_MAX_CHARS, GPT_INPUT_CAP } from '../lib/constants.js';

let state = {
  status: STATES.IDLE,
  detail: '',
  usage: null,
  cost: null,
};

let settings = {};
let aborted = false;
let isRunning = false;

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

// Main pipeline
async function startReading(tabId, tabUrl, quickRead = false) {
  if (isRunning) return;
  isRunning = true;

  try {
    resetState();
    settings = await loadSettings();

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

    // Step 1: Extract content
    updateState({ status: STATES.EXTRACTING, detail: 'Extracting page content...' });

    let extracted;
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

    if (!extracted || extracted.error) {
      sendError('EXTRACTION_FAILED', extracted?.error || 'Failed to extract content from page.');
      return;
    }

    // Truncate if too long
    let rawContent = extracted.content;
    if (rawContent.length > settings.maxContentLength) {
      rawContent = rawContent.slice(0, settings.maxContentLength);
    }

    let chatResult;
    let cleanedText;
    let truncated = false;

    if (quickRead) {
      if (aborted) return;
      // Quick Read: skip GPT, send extracted text directly to TTS
      cleanedText = rawContent;
      if (!cleanedText || cleanedText.trim().length < 20) {
        sendError('EMPTY_RESULT', 'Page content is too short or empty to read.');
        return;
      }
      if (cleanedText.length > TTS_MAX_CHARS) {
        cleanedText = cleanedText.slice(0, TTS_MAX_CHARS);
        truncated = true;
      }
      chatResult = { usage: { promptTokens: 0, completionTokens: 0 } };
    } else {
      // Cap content for GPT — TTS limit is 4096 chars, so no need to clean more than ~8K
      if (rawContent.length > GPT_INPUT_CAP) {
        rawContent = rawContent.slice(0, GPT_INPUT_CAP);
      }

      // Step 2: LLM extraction
      updateState({ status: STATES.PROCESSING, detail: 'Cleaning content with AI...' });

      try {
        chatResult = await extractWithChat(settings.apiKey, rawContent, settings.chatModel);
      } catch (e) {
        sendError('CHAT_ERROR', e.message);
        return;
      }

      if (aborted) return;

      cleanedText = chatResult.text;
      if (!cleanedText || cleanedText.length < 20) {
        sendError('EMPTY_RESULT', 'AI returned very little content. The page may not have readable article text.');
        return;
      }

      // Step 3: Truncate to TTS max chars if needed
      if (cleanedText.length > TTS_MAX_CHARS) {
        cleanedText = cleanedText.slice(0, TTS_MAX_CHARS);
        truncated = true;
      }
    }

    const ttsCharacters = cleanedText.length;

    // Step 4: Calculate cost
    const costInfo = calculateCost(
      settings.chatModel,
      settings.ttsModel,
      chatResult.usage,
      ttsCharacters,
    );

    // Step 5: Send cleaned text to popup for TTS + playback
    updateState({
      status: STATES.PLAYING,
      detail: 'Ready for audio',
      usage: chatResult.usage,
      cost: costInfo,
    });

    chrome.runtime.sendMessage({
      type: 'GENERATE_AND_PLAY',
      cleanedText,
      ttsModel: settings.ttsModel,
      voice: settings.voice,
      apiKey: settings.apiKey,
      cost: costInfo,
      truncated,
    }).catch(() => {});
  } finally {
    isRunning = false;
  }
}

// Message handler (popup -> background)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'START_READING':
      startReading(msg.tabId, msg.tabUrl, msg.quickRead);
      sendResponse({ ok: true });
      return false;

    case 'STOP':
      aborted = true;
      updateState({ status: STATES.IDLE, detail: 'Stopped', usage: null, cost: null });
      sendResponse({ ok: true });
      return false;

    case 'GET_STATE':
      sendResponse({ ...state });
      return false;

    default:
      return false;
  }
});
