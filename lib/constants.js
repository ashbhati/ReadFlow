export const DEFAULTS = {
  chatModel: 'gpt-4o-mini',
  ttsModel: 'tts-1',
  voice: 'nova',
  maxContentLength: 50000,
  playbackSpeed: 1,
};

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const CHAT_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
];

export const TTS_MODELS = [
  { id: 'tts-1', label: 'TTS-1 (Standard)' },
  { id: 'tts-1-hd', label: 'TTS-1 HD' },
  { id: 'gpt-4o-mini-tts', label: 'GPT-4o Mini TTS' },
];

export const VOICES = [
  { id: 'nova', label: 'Nova' },
  { id: 'alloy', label: 'Alloy' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx' },
  { id: 'shimmer', label: 'Shimmer' },
];

export const PRICING = {
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  'tts-1': 15.00 / 1_000_000,
  'tts-1-hd': 30.00 / 1_000_000,
  'gpt-4o-mini-tts': 15.00 / 1_000_000,
};

export const STATES = {
  IDLE: 'idle',
  EXTRACTING: 'extracting',
  PROCESSING: 'processing',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DONE: 'done',
  ERROR: 'error',
};

export const TTS_MAX_CHARS = 4096;

export const GPT_INPUT_CAP = TTS_MAX_CHARS * 2; // Keep GPT work proportional to TTS limit for low latency

export const EXTRACTION_PROMPT = `You are a content extraction assistant. Your job is to clean raw webpage text into narration-ready prose.

Instructions:
- Extract the main article body only. Remove navigation, ads, footers, sidebars, cookie banners, and other clutter.
- Preserve the article's structure and flow. Keep headings as natural transition phrases.
- Summarize code blocks briefly (e.g., "The code defines a function that...") rather than reading code verbatim.
- Summarize tables into natural language.
- Preserve technical terms, proper nouns, and key details faithfully.
- Do NOT add commentary, opinions, or information not in the original.
- Output clean, narration-ready prose that sounds natural when read aloud.
- If the content is very short or appears to be an error page, return it as-is with a note.`;

export const SUMMARY_PROMPT = `You are a content summarization assistant. Condense the following webpage content into a concise summary of approximately 150-200 words (about 1 minute when read aloud).

Instructions:
- Capture the key points, main argument, and essential details.
- Write in clear, narration-ready prose that sounds natural when read aloud.
- Do NOT add commentary, opinions, or information not in the original.
- Output only the summary, no preamble or labels.`;
