# Product Requirements Document
## Product Name: ReadFlow
Chrome Extension for AI-Powered Article Narration

---

# 1. Product Overview

ReadFlow is a Chrome extension that converts articles, news pages, research papers, and PDFs into polished spoken narration using OpenAI Text-to-Speech.

The extension extracts the meaningful content from a webpage, removes clutter such as ads and navigation elements, summarizes code blocks and tables via an LLM, and plays high-quality narration directly in the popup.

The product is designed as a simple MVP for an agentic coding demo, prioritizing clarity and demonstrability over production-grade security or scalability.

---

# 2. Problem Statement

Modern webpages are cluttered with ads, banners, popups, and navigation elements. Users often want to consume technical articles, research papers, or long-form content passively.

Existing reader modes:
- Do not intelligently summarize technical elements
- Do not produce high-quality AI narration
- Do not allow LLM-assisted content extraction
- Do not provide cost transparency

Users want:
- One-click narration
- Clean extraction
- Polished speech
- Minimal configuration

---

# 3. Goals

## Primary Goals (MVP)
- Read main article content from any webpage
- Support PDFs opened in browser
- Use LLM-assisted extraction to clean and prepare content for narration
- Summarize code blocks and tables
- Skip diagrams, figures, footnotes, references
- Produce polished English narration via OpenAI TTS
- Provide playback controls (Play, Pause/Resume, Stop)
- Show API cost breakdown after playback
- Operate only when extension is explicitly clicked

## Non-Goals (MVP)
- Multi-page article stitching
- Offline TTS
- Background continuous monitoring
- Full security hardening
- Mobile browser support
- Advanced playback (skip, rewind, bookmarks)
- Multi-language support
- Background audio (audio stops when popup closes)

---

# 4. User Flow (MVP)

1. User opens article or PDF in Chrome
2. User clicks extension icon
3. Popup appears
4. User presses "Play"
5. Extension:
   - Extracts main content from the page DOM (or PDF text layer)
   - Sends text to OpenAI Chat API for cleanup and summarization
   - Sends cleaned text to OpenAI TTS API (single call, up to 4096 chars)
   - Plays audio directly in the popup
6. User hears narration
7. When playback finishes:
   - Popup displays chat token usage and TTS character count
   - Displays total cost estimate

If extraction or API call fails:
- User is shown a specific failure reason

Note: Popup must remain open during playback. Closing the popup stops audio.

---

# 5. Functional Requirements

## 5.1 Content Extraction

### Webpages
- Inject content script on demand (only when user clicks Play)
- Use DOM parsing with fallback chain: `<article>` -> `<main>` -> `<body>`
- Clone and strip non-content elements (script, style, nav, footer, header, aside)
- Use `textContent` (not `innerText`) for reliable extraction on detached clones
- Send raw text to OpenAI Chat API for LLM-assisted cleanup:
  - Identify main article body
  - Remove clutter remnants
  - Summarize code blocks and tables into narration-ready prose
  - Preserve technical terms and proper nouns

### PDFs
- Extract text via `window.getSelection()` + `selectAllChildren`
- Fallback to `.textLayer span` elements
- If no text found: show error "Could not extract text from this PDF."

### Content Limits
- Configurable max content length (default 50,000 chars, clamped 1,000-200,000)
- Content exceeding max is silently truncated before LLM processing
- LLM output exceeding 4,096 chars is truncated before TTS (user is notified)

---

## 5.2 Narration

- English only
- Single OpenAI TTS API call per session (up to 4,096 characters)
- TTS call is made directly from the popup (not the service worker)
- Audio played via `URL.createObjectURL(blob)` on an HTML Audio element
- Supported TTS models: tts-1, tts-1-hd, gpt-4o-mini-tts
- Supported voices: nova (default), alloy, echo, fable, onyx, shimmer
- 60-second timeout on TTS API call

---

## 5.3 Playback Controls

- **Play**: Start narration pipeline (extract -> clean -> TTS -> play)
- **Pause/Resume**: Toggle audio playback (handled locally in popup)
- **Stop**: Cancel pipeline and/or stop audio playback

Play is disabled while a session is active or paused. Pause/Resume and Stop are disabled when idle.

---

## 5.4 Settings

Settings view (toggled via gear icon) includes:
- OpenAI API Key (password input)
- Chat model dropdown (gpt-4o-mini default, gpt-4o)
- TTS model dropdown (tts-1 default, tts-1-hd, gpt-4o-mini-tts)
- Voice dropdown (nova default + 5 others)
- Max content length (number input, 1,000-200,000)
- Domain blocklist (textarea, one domain per line)

API Key Storage:
- Stored in `chrome.storage.local`
- Warning displayed: "Stored locally in your browser. Never shared."

Settings persist across sessions via `chrome.storage.local`.

---

## 5.5 Cost Display

After playback completes, show:

- Chat API token usage (prompt + completion tokens) and cost
- TTS character count and cost
- Total estimated cost

Cost is calculated from published OpenAI pricing:
- gpt-4o-mini: $0.15/1M input, $0.60/1M output tokens
- gpt-4o: $2.50/1M input, $10.00/1M output tokens
- tts-1: $15.00/1M characters
- tts-1-hd: $30.00/1M characters
- gpt-4o-mini-tts: $15.00/1M characters

Cost is formatted using `Intl.NumberFormat` with 4 decimal places.

---

## 5.6 Error Handling

Specific user-facing messages for:
- No API key configured
- Invalid API key (401)
- Rate limited (429)
- Quota exceeded (402/403)
- Request timeout (60s)
- Content script blocked (chrome:// pages, extension pages)
- PDF with no text layer
- Page with no readable content (<50 chars)
- Domain in blocklist
- Network errors

Errors display in a red status bar and a dedicated error panel.

---

# 6. Non-Functional Requirements

- No always-on content scripts (inject on demand via `chrome.scripting.executeScript`)
- Only activate on user click
- No background monitoring
- Client-side only architecture (MVP)
- English content only
- Must not auto-send page content until user presses Play
- Vanilla JS, no build step, no framework dependencies
- Manifest V3 compliant

---

# 7. Architecture (MVP)

### Components

1. **Content Script** (`content/content-script.js`)
   - IIFE injected on demand
   - Extracts raw text from DOM or PDF
   - Returns `{ title, url, content, isPdf, charCount }` or `{ error }`

2. **Background Service Worker** (`background/service-worker.js`)
   - ES module service worker
   - Orchestrates pipeline: extraction -> LLM cleanup -> hand off to popup
   - Calls OpenAI Chat API for content cleaning
   - Calculates cost
   - Sends cleaned text + settings to popup via `chrome.runtime.sendMessage`
   - Manages state (idle/extracting/processing/playing/done/error)
   - Does NOT handle TTS or audio

3. **Popup** (`popup/popup.html`, `popup.css`, `popup.js`)
   - Playback controls and status display
   - Calls OpenAI TTS API directly (receives cleaned text from background)
   - Plays audio via `new Audio(URL.createObjectURL(blob))`
   - Handles pause/resume locally
   - Displays cost breakdown on completion
   - Settings management

4. **Shared Libraries** (`lib/`)
   - `openai-chat.js` — Chat Completions API wrapper
   - `openai-tts.js` — TTS API wrapper (returns Blob)
   - `cost.js` — Cost calculator and formatter
   - `constants.js` — Defaults, model lists, pricing, state enum, extraction prompt

5. **Chrome Storage**
   - Stores API key and user preferences

### Message Flow

| Direction | Type | Payload |
|-----------|------|---------|
| Popup -> BG | `START_READING` | `{ tabId, tabUrl }` |
| Popup -> BG | `STOP` | `{}` |
| Popup -> BG | `GET_STATE` | `{}` |
| BG -> Popup | `STATUS_UPDATE` | `{ status, detail, ... }` |
| BG -> Popup | `GENERATE_AND_PLAY` | `{ cleanedText, ttsModel, voice, apiKey, cost, truncated }` |
| BG -> Popup | `ERROR` | `{ code, message }` |

Pause/Resume are handled entirely within the popup (local Audio element control).

### Key Design Decisions

- **TTS in popup, not service worker**: The popup makes the TTS fetch call directly and plays the resulting blob via `URL.createObjectURL`. This avoids base64 encoding, large message passing, and offscreen document complexity. The tradeoff is that audio stops when the popup closes — acceptable for MVP.
- **Single TTS call**: No text chunking. Content is truncated to 4,096 chars (TTS API limit) if needed. This eliminates chunk state management, sequential playback coordination, and chunk progress UI.
- **No offscreen document**: Earlier iterations used Chrome's Offscreen Document API for persistent audio. This added significant complexity (port-based messaging, readiness signaling, race conditions) without working reliably. Removed in favor of direct popup playback.
- **On-demand injection**: Content script is not declared in manifest. Injected via `chrome.scripting.executeScript` only when user clicks Play.
- **Domain matching**: Blocklist uses exact match or suffix match (`hostname === domain || hostname.endsWith('.' + domain)`) to prevent false positives.

---

# 8. Security Considerations (MVP Tradeoffs)

MVP is 100% client-side.

Risks:
- API key stored in `chrome.storage.local` (not encrypted)
- No rate limiting
- No server-side validation
- Potential large-cost incidents

Mitigations:
- Manual API key entry with warning label
- Domain blocklist
- Configurable content size cap (clamped to 200,000 max)
- TTS limited to 4,096 chars per session
- Cost reporting after each session
- CSP meta tags on extension pages
- Safe DOM creation (no innerHTML with dynamic data)

---

# 9. Future Improvements

## 9.1 Background Audio
- Use Chrome's Offscreen Document API or Side Panel for persistent playback
- Audio continues when popup closes
- Requires robust message passing between contexts

## 9.2 Longer Content Support
- For content exceeding 4,096 chars: chunk text and pre-fetch next audio while current plays
- Seamless crossfade between chunks
- No visible chunk UI — just continuous playback

## 9.3 Backend Architecture
- Lightweight API proxy to hide API keys
- Per-user rate limits and usage quotas
- Centralized logging and analytics
- SaaS monetization path

## 9.4 Security Enhancements
- Encrypted key storage
- Secure vault integration
- Request signing and throttling
- Token usage caps

## 9.5 Playback Enhancements
- Skip forward/back
- Playback speed control
- Sentence-level seeking
- Highlight text while reading
- Bookmark sections

## 9.6 PDF Improvements
- OCR support for scanned PDFs
- Layout-aware summarization
- Academic paper mode (abstract-first reading)

## 9.7 Narration Enhancements
- Adjustable speed
- Tone styles (neutral, academic, conversational)
- Podcast-style summary mode

## 9.8 Local TTS Option
- Web Speech API fallback (free, lower quality)
- On-device TTS engines
- Hybrid: local for preview, cloud for final

## 9.9 Agentic Features
- Ask questions about the article
- Summarize specific sections
- Explain equations
- Voice command control

---

# 10. Success Metrics (For Demo)

Primary:
- Successful extraction and narration on common blog/news sites
- End-to-end flow completes without errors
- Audio plays clearly in the popup

Secondary:
- Accurate cost reporting
- Clean, understandable architecture
- No silent failures — all errors surfaced to user
