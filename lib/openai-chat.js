import { EXTRACTION_PROMPT } from './constants.js';

/**
 * Call OpenAI Chat Completions API to clean/extract article content.
 * Returns { text, usage: { promptTokens, completionTokens } }
 */
export async function extractWithChat(apiKey, rawText, model = 'gpt-4o-mini') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: `Extract and clean the following webpage content for narration:\n\n${rawText}` },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Chat request timed out after 60 seconds. Check your network connection.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error('Invalid API key. Check your OpenAI API key in settings.');
    if (status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
    if (status === 402 || status === 403) throw new Error('API quota exceeded. Check your OpenAI billing.');
    let message = response.statusText;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) message = errBody.error.message;
    } catch { /* ignore parse errors */ }
    throw new Error(`OpenAI API error (${status}): ${message}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('No response from OpenAI API.');

  return {
    text: choice.message.content.trim(),
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
    },
  };
}
