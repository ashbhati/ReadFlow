# Product Requirements Document
## Product Name: ReadFlow (Working Title)
Chrome Extension for AI-Powered Article Narration

---

# 1. Product Overview

ReadFlow is a Chrome extension that converts articles, news pages, research papers, and PDFs into polished spoken narration using OpenAI Text-to-Speech.

The extension extracts the meaningful content from a webpage, removes clutter such as ads and navigation elements, summarizes code blocks and tables, and streams high-quality narration to the user.

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
- Use LLM-assisted extraction
- Summarize code blocks and tables
- Skip diagrams, figures, footnotes, references
- Produce polished English narration via OpenAI TTS
- Provide simple playback controls (Play/Pause)
- Show final API cost after playback
- Operate only when extension is explicitly clicked

## Non-Goals (MVP)
- Multi-page article stitching
- Offline TTS
- Background continuous monitoring
- Full security hardening
- Mobile browser support
- Advanced playback (skip, rewind, bookmarks)
- Multi-language support

---

# 4. User Flow (MVP)

1. User opens article or PDF in Chrome
2. User clicks extension icon
3. Popup appears
4. User presses "Play"
5. Extension:
   - Extracts main content
   - Sends text to OpenAI for cleanup and summarization
   - Sends processed text to OpenAI TTS
   - Streams audio to popup player
6. User hears narration
7. When playback finishes:
   - Popup displays total tokens used
   - Displays total cost estimate

If extraction fails:
- User is shown specific failure reason

---

# 5. Functional Requirements

## 5.1 Content Extraction

### Webpages
- Use DOM parsing to collect page content
- Use LLM-assisted extraction to:
  - Identify main article body
  - Remove ads, banners, nav, sidebars
  - Skip footnotes and references
  - Skip figures and diagrams
  - Summarize code blocks
  - Summarize tables

### PDFs
- Extract text from Chrome’s PDF text layer
- If PDF has no extractable text:
  - Show error: "PDF contains no selectable text layer."

### Infinite Scroll
- Read only currently loaded content
- Do not auto-scroll

### Multi-page Articles
- Not supported
- User must manually navigate and re-initiate playback

---

## 5.2 Narration

- English only
- Use OpenAI Text-to-Speech
- Produce polished narration
- Preserve technical terms, model names, symbols
- Summarize code and tables before TTS
- Stream audio if supported
- Fallback to chunked generation if streaming unavailable

---

## 5.3 Playback Controls

MVP Controls:
- Play
- Pause

No seek, skip, rewind in v1.

---

## 5.4 Settings

Settings View Includes:
- OpenAI API Key input field
- Model selection dropdown (default pre-selected)
- Voice selection (if supported)
- Max content length limit
- Domain blocklist field

API Key Storage:
- Stored in chrome.storage.local
- Warning displayed: "Stored locally. Not equivalent to password manager security."

---

## 5.5 Cost Display

After playback completes, show:

- Extraction LLM token usage
- Summarization token usage
- TTS token usage
- Total tokens
- Total cost (based on model pricing)

Cost estimation is approximate and based on published pricing.

---

## 5.6 Failure Handling

If extraction fails, show reason:

- Could not identify main content
- Page blocked content script access
- PDF contains no selectable text
- Content exceeds max allowed length
- OpenAI API error (auth/network/rate limit)

---

# 6. Non-Functional Requirements

- No always-on content scripts
- Only activate on user click
- No background monitoring
- Client-side only architecture (MVP)
- English content only
- Must not auto-send page content until user presses Play

---

# 7. Architecture (MVP)

### Components

1. Content Script
   - Extract raw DOM text
   - Send to background worker

2. Background Service Worker
   - Orchestrates:
     - Extraction LLM call
     - Summarization
     - TTS generation
   - Manages chunk queue
   - Tracks token usage
   - Computes cost

3. Popup UI
   - Playback controls
   - Status indicator
   - Cost summary
   - Error display

4. Chrome Storage
   - Stores API key
   - Stores user preferences

---

# 8. Security Considerations (MVP Tradeoffs)

MVP is 100% client-side.

Risks:
- API key exposure risk
- No rate limiting
- No server-side validation
- Potential large-cost incidents

Mitigations:
- Manual API key entry
- Optional domain blocklist
- Hard content size cap
- Clear cost reporting
- Clear warning in settings

---

# 9. Future Improvements

## 9.1 Backend Architecture

Move to backend-based architecture to:

- Hide API keys
- Add per-user rate limits
- Add usage quotas
- Add abuse protection
- Centralize logging
- Support analytics
- Enable SaaS monetization

Recommended:
- Lightweight Node.js API proxy
- User auth (OAuth)
- Encrypted key storage
- Spend caps per user

---

## 9.2 Security Enhancements

- Key encryption
- Secure vault storage
- CSP hardening
- Signed request validation
- Token usage caps
- Request throttling

---

## 9.3 Latency Improvements

- Parallel extraction and summarization
- Smarter chunk sizing
- Predictive prefetch of next chunk
- Audio streaming optimization
- Caching processed text
- On-device preprocessing before LLM

---

## 9.4 Playback Enhancements

- Skip forward/back
- Sentence-level seeking
- Highlight text while reading
- Side panel player (persistent playback)
- Background audio support
- Bookmark sections

---

## 9.5 PDF Improvements

- OCR support for scanned PDFs
- Layout-aware summarization
- Academic paper mode (abstract-first reading)

---

## 9.6 Narration Enhancements

- Multiple voices
- Adjustable speed
- Tone styles (neutral, academic, conversational)
- Podcast-style summary mode
- Executive summary mode

---

## 9.7 Local TTS Option

Abstract TTS provider interface to allow:

- OpenAI TTS
- Web Speech API
- On-device TTS engines
- Hybrid fallback

---

## 9.8 Agentic Enhancements

- Ask questions about the article
- Summarize specific sections
- Explain equations
- Voice command control
- Conversational mode
- Auto-read newly loaded content

---

# 10. Success Metrics (For Demo)

Primary:
- Successful extraction rate above 70% on news and blog sites
- End-to-end narration under 5 seconds startup latency

Secondary:
- Accurate cost reporting
- No API key misuse during demo
- Clean, understandable architecture for agentic coding demo

