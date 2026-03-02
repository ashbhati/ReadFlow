import { CHAT_MODELS, TTS_MODELS, VOICES, DEFAULTS, STATES } from '../lib/constants.js';
import { formatCost } from '../lib/cost.js';
import { streamTTS } from '../lib/openai-tts.js';

// DOM elements
const statusBar = document.getElementById('statusBar');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const costSummary = document.getElementById('costSummary');
const costDetails = document.getElementById('costDetails');
const errorDisplay = document.getElementById('errorDisplay');
const settingsBtn = document.getElementById('settingsBtn');
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

// Settings inputs
const apiKeyInput = document.getElementById('apiKeyInput');
const chatModelSelect = document.getElementById('chatModelSelect');
const ttsModelSelect = document.getElementById('ttsModelSelect');
const voiceSelect = document.getElementById('voiceSelect');
const maxLengthInput = document.getElementById('maxLengthInput');
const blocklistInput = document.getElementById('blocklistInput');
const quickReadCheckbox = document.getElementById('quickReadCheckbox');

let currentAudio = null;
let currentCleanup = null;

// Populate dropdowns
function populateDropdowns() {
  CHAT_MODELS.forEach(m => {
    chatModelSelect.add(new Option(m.label, m.id));
  });
  TTS_MODELS.forEach(m => {
    ttsModelSelect.add(new Option(m.label, m.id));
  });
  VOICES.forEach(v => {
    voiceSelect.add(new Option(v.label, v.id));
  });
}

// Load settings into form
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'apiKey', 'chatModel', 'ttsModel', 'voice', 'maxContentLength', 'blocklist',
  ]);
  apiKeyInput.value = result.apiKey || '';
  chatModelSelect.value = result.chatModel || DEFAULTS.chatModel;
  ttsModelSelect.value = result.ttsModel || DEFAULTS.ttsModel;
  voiceSelect.value = result.voice || DEFAULTS.voice;
  maxLengthInput.value = result.maxContentLength || DEFAULTS.maxContentLength;
  blocklistInput.value = result.blocklist || '';
}

// Save settings
async function saveSettings() {
  await chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(),
    chatModel: chatModelSelect.value,
    ttsModel: ttsModelSelect.value,
    voice: voiceSelect.value,
    maxContentLength: parseInt(maxLengthInput.value) || DEFAULTS.maxContentLength,
    blocklist: blocklistInput.value,
  });
}

// Update UI based on state
function updateUI(state) {
  const { status, detail } = state;

  // Status bar
  statusBar.textContent = detail || statusLabel(status);
  statusBar.className = 'status-bar';
  if (status === STATES.ERROR) statusBar.classList.add('error');
  else if (status === STATES.DONE) statusBar.classList.add('done');
  else if (status !== STATES.IDLE) statusBar.classList.add('active');

  // Button states
  const isActive = ![STATES.IDLE, STATES.DONE, STATES.ERROR, STATES.PAUSED].includes(status);
  playBtn.disabled = isActive || status === STATES.PAUSED;
  pauseBtn.disabled = !isActive && status !== STATES.PAUSED;
  stopBtn.disabled = !isActive && status !== STATES.PAUSED;

  // Update pause button text and icon
  const pauseSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pauseSvg.setAttribute('width', '16');
  pauseSvg.setAttribute('height', '16');
  pauseSvg.setAttribute('viewBox', '0 0 24 24');
  pauseSvg.setAttribute('fill', 'currentColor');

  if (status === STATES.PAUSED) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '5,3 19,12 5,21');
    pauseSvg.appendChild(poly);
    pauseBtn.textContent = '';
    pauseBtn.appendChild(pauseSvg);
    pauseBtn.appendChild(document.createTextNode(' Resume'));
  } else {
    const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect1.setAttribute('x', '6');
    rect1.setAttribute('y', '4');
    rect1.setAttribute('width', '4');
    rect1.setAttribute('height', '16');
    const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect2.setAttribute('x', '14');
    rect2.setAttribute('y', '4');
    rect2.setAttribute('width', '4');
    rect2.setAttribute('height', '16');
    pauseSvg.appendChild(rect1);
    pauseSvg.appendChild(rect2);
    pauseBtn.textContent = '';
    pauseBtn.appendChild(pauseSvg);
    pauseBtn.appendChild(document.createTextNode(' Pause'));
  }

  // Error display
  if (status === STATES.ERROR) {
    errorDisplay.textContent = detail || 'An error occurred.';
    errorDisplay.classList.remove('hidden');
  } else {
    errorDisplay.classList.add('hidden');
  }
}

function statusLabel(status) {
  const labels = {
    [STATES.IDLE]: 'Ready to read',
    [STATES.EXTRACTING]: 'Extracting content...',
    [STATES.PROCESSING]: 'Cleaning with AI...',
    [STATES.PLAYING]: 'Playing...',
    [STATES.PAUSED]: 'Paused',
    [STATES.DONE]: 'Playback complete',
    [STATES.ERROR]: 'Error',
  };
  return labels[status] || status;
}

function showCost(costInfo) {
  const { chatCost, ttsCost, totalCost, breakdown } = costInfo;

  // Clear previous content
  costDetails.textContent = '';

  // Chat line
  const chatLine = document.createElement('div');
  chatLine.className = 'cost-line';
  const chatLabel = document.createElement('span');
  chatLabel.textContent = `Chat (${breakdown.promptTokens + breakdown.completionTokens} tokens)`;
  const chatValue = document.createElement('span');
  chatValue.textContent = formatCost(chatCost);
  chatLine.appendChild(chatLabel);
  chatLine.appendChild(chatValue);

  // TTS line
  const ttsLine = document.createElement('div');
  ttsLine.className = 'cost-line';
  const ttsLabel = document.createElement('span');
  ttsLabel.textContent = `TTS (${breakdown.ttsCharacters.toLocaleString()} chars)`;
  const ttsValue = document.createElement('span');
  ttsValue.textContent = formatCost(ttsCost);
  ttsLine.appendChild(ttsLabel);
  ttsLine.appendChild(ttsValue);

  // Total line
  const totalLine = document.createElement('div');
  totalLine.className = 'cost-line cost-total';
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total';
  const totalValue = document.createElement('span');
  totalValue.textContent = formatCost(totalCost);
  totalLine.appendChild(totalLabel);
  totalLine.appendChild(totalValue);

  costDetails.appendChild(chatLine);
  costDetails.appendChild(ttsLine);
  costDetails.appendChild(totalLine);

  costSummary.classList.remove('hidden');
}

// TTS and audio playback — runs entirely in the popup
async function handleTTSAndPlay(msg) {
  const { cleanedText, ttsModel, voice, apiKey, cost, truncated } = msg;

  if (!cleanedText) {
    updateUI({ status: STATES.ERROR, detail: 'No text to read.' });
    return;
  }

  updateUI({ status: STATES.PROCESSING, detail: 'Generating audio...' });

  let audio, cleanup;
  try {
    ({ audio, cleanup } = await streamTTS(apiKey, cleanedText, ttsModel, voice));
  } catch (e) {
    updateUI({ status: STATES.ERROR, detail: e.message });
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
  }

  currentAudio = audio;
  currentCleanup = cleanup;

  currentAudio.onended = () => {
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
    updateUI({ status: STATES.DONE, detail: 'Playback complete' });
    if (cost) showCost(cost);
  };

  currentAudio.onerror = () => {
    const mediaErr = currentAudio?.error;
    const detail = mediaErr
      ? `Audio playback failed (code ${mediaErr.code}).`
      : 'Audio playback failed.';
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
    updateUI({ status: STATES.ERROR, detail });
  };

  const statusDetail = truncated ? 'Playing (text truncated to fit TTS limit)' : 'Playing...';
  updateUI({ status: STATES.PLAYING, detail: statusDetail });

  currentAudio.play().catch((err) => {
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
    updateUI({ status: STATES.ERROR, detail: `Audio playback failed: ${err.message}` });
  });
}

// Event listeners
playBtn.addEventListener('click', async () => {
  costSummary.classList.add('hidden');
  errorDisplay.classList.add('hidden');

  // Stop any existing audio
  if (currentAudio) {
    currentAudio.pause();
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    updateUI({ status: STATES.ERROR, detail: 'No active tab found.' });
    return;
  }
  chrome.runtime.sendMessage({ type: 'START_READING', tabId: tab.id, tabUrl: tab.url, quickRead: quickReadCheckbox.checked });
});

pauseBtn.addEventListener('click', () => {
  if (!currentAudio) return;
  if (currentAudio.paused) {
    currentAudio.play().catch(() => {});
    updateUI({ status: STATES.PLAYING, detail: 'Playing...' });
  } else {
    currentAudio.pause();
    updateUI({ status: STATES.PAUSED, detail: 'Paused' });
  }
});

stopBtn.addEventListener('click', () => {
  if (currentAudio) {
    currentAudio.pause();
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
  }
  chrome.runtime.sendMessage({ type: 'STOP' });
  updateUI({ status: STATES.IDLE, detail: 'Stopped' });
});

settingsBtn.addEventListener('click', () => {
  mainView.classList.add('hidden');
  settingsView.classList.remove('hidden');
  loadSettings();
});

saveSettingsBtn.addEventListener('click', async () => {
  await saveSettings();
  settingsView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

cancelSettingsBtn.addEventListener('click', () => {
  settingsView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'STATUS_UPDATE':
      updateUI(msg);
      break;

    case 'GENERATE_AND_PLAY': {
      // TTS call happens directly in the popup — no message-passing for audio data
      handleTTSAndPlay(msg);
      break;
    }

    case 'ERROR':
      updateUI({ status: STATES.ERROR, detail: msg.message });
      break;
  }
});

// Persist Quick Read preference
quickReadCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ quickRead: quickReadCheckbox.checked });
});

// Clean up streaming audio if the popup is closed mid-playback
window.addEventListener('pagehide', () => {
  if (currentAudio) {
    currentAudio.pause();
    if (currentCleanup) currentCleanup();
    currentAudio = null;
    currentCleanup = null;
  }
});

// Initialize
populateDropdowns();

// Load Quick Read preference
chrome.storage.local.get(['quickRead'], (result) => {
  quickReadCheckbox.checked = result.quickRead || false;
});

// Restore state from background on popup open
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response) {
    updateUI(response);
    if (response.cost && response.status === STATES.DONE) {
      showCost(response.cost);
    }
  }
});
