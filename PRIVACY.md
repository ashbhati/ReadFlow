# ReadFlow Privacy Policy

**Last updated:** March 7, 2026

## Overview

ReadFlow is a Chrome extension that converts webpage content into audio using OpenAI's APIs. Your privacy is important — ReadFlow is designed to keep your data local.

## Data Collection

ReadFlow does **not** collect, store, or transmit any personal data to any server owned or operated by ReadFlow. There are no analytics, tracking pixels, cookies, or telemetry of any kind.

## Data Storage

The following data is stored **locally in your browser** using Chrome's storage API:

- Your OpenAI API key
- Your preferences (voice, model, speed, read mode)
- Cached audio files (stored in IndexedDB for replay)

This data never leaves your browser except as described below.

## Third-Party Services

ReadFlow connects to **OpenAI's API** (`api.openai.com`) to:

1. Clean and extract article content (Chat Completions API)
2. Generate text-to-speech audio (TTS API)

Your page content is sent to OpenAI for processing when you click Play. This communication uses your own OpenAI API key and is governed by [OpenAI's privacy policy](https://openai.com/privacy) and [terms of use](https://openai.com/terms).

ReadFlow does not send data to any other external service.

## Permissions

- **activeTab** — Access the current page to extract article text (only when you click Play)
- **storage** — Save your preferences and API key locally
- **scripting** — Inject the content extraction script into the active tab
- **offscreen** — Play audio in the background when the popup is closed

## Data Sharing

ReadFlow does not share, sell, or transfer your data to any third party. The only external communication is with OpenAI's API, initiated by your action and authenticated with your own API key.

## Changes

If this policy changes, the updated version will be posted in this repository.

## Contact

If you have questions about this privacy policy, open an issue at [github.com/ashbhati/ReadFlow](https://github.com/ashbhati/ReadFlow/issues).
