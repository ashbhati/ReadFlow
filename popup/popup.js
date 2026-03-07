import { CHAT_MODELS, TTS_MODELS, VOICES, DEFAULTS, STATES, PLAYBACK_SPEEDS } from '../lib/constants.js';
import { formatCost } from '../lib/cost.js';

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
const clearCacheBtn = document.getElementById('clearCacheBtn');

// Settings inputs
const apiKeyInput = document.getElementById('apiKeyInput');
const chatModelSelect = document.getElementById('chatModelSelect');
const ttsModelSelect = document.getElementById('ttsModelSelect');
const voiceSelect = document.getElementById('voiceSelect');
const maxLengthInput = document.getElementById('maxLengthInput');
const blocklistInput = document.getElementById('blocklistInput');

// Mode pills
const quickReadPill = document.getElementById('quickReadPill');
const summaryPill = document.getElementById('summaryPill');

// Speed chips container
const speedChipsContainer = document.getElementById('speedChips');

// Progress elements
const progressContainer = document.getElementById('progressContainer');
const progressBarFill = document.getElementById('progressBarFill');
const progressBarTrack = progressContainer.querySelector('.progress-bar-track');
const progressElapsed = document.getElementById('progressElapsed');
const progressRemaining = document.getElementById('progressRemaining');

// Cached badge
const cachedBadge = document.getElementById('cachedBadge');

// Track current duration for seek
let currentDuration = 0;

// Populate settings dropdowns
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

// Build speed chips
function buildSpeedChips(activeSpeed) {
  speedChipsContainer.textContent = '';
  PLAYBACK_SPEEDS.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'speed-chip';
    chip.textContent = s === 1 ? '1x' : `${s}x`;
    chip.dataset.speed = s;
    if (s === activeSpeed) chip.classList.add('active');
    chip.addEventListener('click', () => {
      speedChipsContainer.querySelectorAll('.speed-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const speed = parseFloat(chip.dataset.speed);
      chrome.storage.local.set({ playbackSpeed: speed });
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_SET_SPEED', speed });
    });
    speedChipsContainer.appendChild(chip);
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

// Format time as M:SS
function formatTime(seconds) {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  // Progress bar visibility
  if ([STATES.IDLE, STATES.DONE, STATES.ERROR].includes(status)) {
    progressContainer.classList.add('hidden');
    progressBarFill.style.width = '0%';
    currentDuration = 0;
  } else if (status === STATES.PLAYING || status === STATES.PAUSED) {
    progressContainer.classList.remove('hidden');
  }

  // Cached badge
  if ([STATES.IDLE, STATES.DONE, STATES.ERROR].includes(status)) {
    cachedBadge.classList.add('hidden');
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
    [STATES.IDLE]: 'Ready',
    [STATES.EXTRACTING]: 'Grabbing page content...',
    [STATES.PROCESSING]: 'Preparing your article...',
    [STATES.PLAYING]: 'Playing',
    [STATES.PAUSED]: 'Paused',
    [STATES.DONE]: 'All done!',
    [STATES.ERROR]: 'Error',
  };
  return labels[status] || status;
}

function showCost(costInfo) {
  const { chatCost, ttsCost, totalCost, breakdown } = costInfo;

  costDetails.textContent = '';

  const chatLine = document.createElement('div');
  chatLine.className = 'cost-line';
  const chatLabel = document.createElement('span');
  chatLabel.textContent = `Chat (${breakdown.promptTokens + breakdown.completionTokens} tokens)`;
  const chatValue = document.createElement('span');
  chatValue.textContent = formatCost(chatCost);
  chatLine.appendChild(chatLabel);
  chatLine.appendChild(chatValue);

  const ttsLine = document.createElement('div');
  ttsLine.className = 'cost-line';
  const ttsLabel = document.createElement('span');
  ttsLabel.textContent = `TTS (${breakdown.ttsCharacters.toLocaleString()} chars)`;
  const ttsValue = document.createElement('span');
  ttsValue.textContent = formatCost(ttsCost);
  ttsLine.appendChild(ttsLabel);
  ttsLine.appendChild(ttsValue);

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

// Event listeners
playBtn.addEventListener('click', async () => {
  costSummary.classList.add('hidden');
  errorDisplay.classList.add('hidden');
  cachedBadge.classList.add('hidden');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    updateUI({ status: STATES.ERROR, detail: 'No active tab found.' });
    return;
  }
  chrome.runtime.sendMessage({
    type: 'START_READING',
    tabId: tab.id,
    tabUrl: tab.url,
    quickRead: quickReadPill.classList.contains('active'),
    summaryMode: summaryPill.classList.contains('active'),
  });
});

pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.status === STATES.PAUSED) {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_RESUME' });
      updateUI({ status: STATES.PLAYING, detail: 'Playing' });
    } else {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_PAUSE' });
      updateUI({ status: STATES.PAUSED, detail: 'Paused' });
    }
  });
});

stopBtn.addEventListener('click', () => {
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

clearCacheBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_AUDIO_CACHE' }, () => {
    clearCacheBtn.textContent = 'Cache Cleared!';
    setTimeout(() => { clearCacheBtn.textContent = 'Clear Audio Cache'; }, 2000);
  });
});

// Mode pills — mutually exclusive toggles
quickReadPill.addEventListener('click', () => {
  const wasActive = quickReadPill.classList.contains('active');
  quickReadPill.classList.toggle('active');
  if (!wasActive) summaryPill.classList.remove('active');
  chrome.storage.local.set({
    quickRead: quickReadPill.classList.contains('active'),
    summaryMode: summaryPill.classList.contains('active'),
  });
});

summaryPill.addEventListener('click', () => {
  const wasActive = summaryPill.classList.contains('active');
  summaryPill.classList.toggle('active');
  if (!wasActive) quickReadPill.classList.remove('active');
  chrome.storage.local.set({
    quickRead: quickReadPill.classList.contains('active'),
    summaryMode: summaryPill.classList.contains('active'),
  });
});

// Seekable progress bar
progressBarTrack.addEventListener('click', (e) => {
  if (!currentDuration || !isFinite(currentDuration) || currentDuration <= 0) return;
  const rect = progressBarTrack.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  const time = ratio * currentDuration;
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_SEEK', time });
});

// Keyboard shortcuts within popup
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    pauseBtn.click();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    stopBtn.click();
  }
});

// Listen for messages from background/offscreen
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'STATUS_UPDATE':
      updateUI(msg);
      break;

    case 'ERROR':
      updateUI({ status: STATES.ERROR, detail: msg.message });
      break;

    case 'OFFSCREEN_PROGRESS': {
      const { currentTime, duration } = msg;
      progressElapsed.textContent = formatTime(currentTime);

      if (duration && isFinite(duration) && duration > 0) {
        currentDuration = duration;
        const pct = Math.min(100, (currentTime / duration) * 100);
        progressBarFill.style.width = `${pct}%`;
        const remaining = Math.max(0, duration - currentTime);
        progressRemaining.textContent = `-${formatTime(remaining)}`;
      } else {
        progressBarFill.style.width = '0%';
        progressRemaining.textContent = '';
      }
      break;
    }

    case 'OFFSCREEN_CACHED':
      cachedBadge.classList.remove('hidden');
      break;

    case 'OFFSCREEN_DONE':
      break;
  }
});

// Initialize
populateDropdowns();

// Load preferences and build speed chips
chrome.storage.local.get(['quickRead', 'summaryMode', 'playbackSpeed'], (result) => {
  if (result.quickRead) quickReadPill.classList.add('active');
  if (result.summaryMode) summaryPill.classList.add('active');
  buildSpeedChips(result.playbackSpeed || DEFAULTS.playbackSpeed);
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

// Pre-fetch content extraction on popup open (fire-and-forget)
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab?.url) {
      chrome.runtime.sendMessage({ type: 'PREFETCH', tabId: tab.id, tabUrl: tab.url });
    }
  } catch (e) {
    // Prefetch failure is non-fatal
  }
})();
