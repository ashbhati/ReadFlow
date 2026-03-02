# ReadFlow

A Chrome extension that turns any webpage or PDF into a narrated audio experience. ReadFlow extracts the main content, cleans it with AI, and plays it back using OpenAI's text-to-speech — with streaming playback so audio starts in under a second.

## Features

- **One-click narration** — Click Play on any article, blog post, or documentation page
- **AI-powered cleaning** — GPT strips navigation, ads, and clutter, leaving clean narration-ready prose
- **Quick Read mode** — Skip AI cleaning and send extracted text straight to TTS for instant playback
- **Streaming TTS** — Audio starts playing while the rest is still downloading (MediaSource Extensions)
- **PDF support** — Extracts text from browser-rendered PDFs
- **Playback controls** — Play, pause, resume, and stop
- **Configurable** — Choose your voice, TTS model, chat model, and content length limits
- **Cost tracking** — See per-session cost breakdown (chat tokens + TTS characters)
- **Domain blocklist** — Block specific sites from being read
- **Privacy-first** — Your API key is stored locally and never leaves your browser except to call OpenAI

## Prerequisites

- Google Chrome (or any Chromium-based browser)
- An [OpenAI API key](https://platform.openai.com/api-keys) with access to Chat Completions and TTS APIs

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/ashbhati/ReadFlow.git
   ```

2. **Open Chrome Extensions page**

   Navigate to `chrome://extensions/` in your browser.

3. **Enable Developer Mode**

   Toggle the "Developer mode" switch in the top-right corner.

4. **Load the extension**

   Click "Load unpacked" and select the `ReadFlow` directory you just cloned.

5. **Pin the extension** (optional)

   Click the puzzle piece icon in Chrome's toolbar and pin ReadFlow for easy access.

## Setup

1. Click the ReadFlow icon in your toolbar to open the popup.
2. Click the gear icon (top-right) to open Settings.
3. Enter your **OpenAI API Key** (`sk-...`).
4. Click **Save**.

That's it — you're ready to go.

## Usage

1. Navigate to any article or webpage you want to listen to.
2. Click the ReadFlow icon to open the popup.
3. Click **Play**.
4. ReadFlow will:
   - Extract the page content
   - Clean it with AI (or skip this with Quick Read)
   - Stream the audio — playback starts almost immediately
5. Use **Pause** / **Resume** / **Stop** as needed.
6. After playback completes, the session cost is displayed.

### Quick Read Mode

Check the **Quick Read** checkbox before clicking Play to skip AI cleaning. This sends the raw extracted text directly to TTS — faster and cheaper, but the audio may include some page clutter.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **API Key** | — | Your OpenAI API key (stored locally, never shared) |
| **Chat Model** | GPT-4o Mini | Model used for content cleaning (`gpt-4o-mini` or `gpt-4o`) |
| **TTS Model** | TTS-1 | Text-to-speech model (`tts-1`, `tts-1-hd`, or `gpt-4o-mini-tts`) |
| **Voice** | Nova | TTS voice (Nova, Alloy, Echo, Fable, Onyx, Shimmer) |
| **Max Content Length** | 50,000 chars | Maximum characters to extract from a page |
| **Domain Blocklist** | — | Domains to block (one per line) |

## How It Works

```
Webpage → Content Script → Background Worker → Popup
           (extract)        (AI clean)         (TTS + playback)
```

1. **Content extraction** (`content/content-script.js`) — Injected into the active tab. Finds the `<article>`, `<main>`, or `<body>`, strips scripts/nav/ads, and returns clean text. For PDFs, it pulls text from the text layer.

2. **AI cleaning** (`background/service-worker.js` + `lib/openai-chat.js`) — Sends the raw text to OpenAI Chat Completions with a prompt that produces narration-ready prose. Code blocks are summarized, tables are converted to natural language, and headings become transition phrases.

3. **Streaming TTS** (`lib/openai-tts.js`) — Fetches audio from OpenAI's TTS API and pipes it through MediaSource Extensions so playback starts as soon as the first chunks arrive. Falls back to a standard blob download if MSE is unavailable.

4. **Playback** (`popup/popup.js`) — Manages the `<audio>` element with play/pause/stop controls and displays the session cost breakdown when finished.

## Project Structure

```
ReadFlow/
├── manifest.json              # Chrome extension manifest (MV3)
├── background/
│   └── service-worker.js      # Pipeline orchestrator
├── content/
│   └── content-script.js      # Page content extraction
├── lib/
│   ├── constants.js           # Models, voices, pricing, prompts
│   ├── cost.js                # Cost calculation and formatting
│   ├── openai-chat.js         # Chat Completions API client
│   └── openai-tts.js          # TTS API client with MSE streaming
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Popup styles
│   └── popup.js               # UI logic and audio playback
└── icons/                     # Extension icons (16, 48, 128px)
```

## Cost Estimates

ReadFlow shows the exact cost after each session. Typical costs per article:

| Component | Model | Approximate Cost |
|-----------|-------|-----------------|
| Chat cleaning | GPT-4o Mini | $0.0001 – $0.0005 |
| Chat cleaning | GPT-4o | $0.002 – $0.01 |
| TTS | TTS-1 | $0.02 – $0.06 |
| TTS | TTS-1 HD | $0.04 – $0.12 |

Quick Read mode skips the chat step entirely, so you only pay for TTS.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No API key set" | Open Settings and enter your OpenAI API key |
| "Invalid API key" | Double-check your key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| "Rate limited" | Wait a few seconds and try again |
| "TTS quota exceeded" | Check your [OpenAI billing](https://platform.openai.com/account/billing) |
| "Cannot access this page" | Chrome internal pages (`chrome://`, `about:`) cannot be read |
| Audio doesn't start | Make sure the popup stays open during playback |
| PDF text not extracted | The PDF may be image-based (scanned) without a text layer |

## License

MIT
