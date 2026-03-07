import { EXTRACTION_PROMPT } from './constants.js';
import { withRetry } from './retry.js';

/**
 * Call OpenAI Chat Completions API to clean/extract article content.
 * Returns { text, usage: { promptTokens, completionTokens } }
 * @param {string} apiKey
 * @param {string} rawText
 * @param {string} [model]
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt] - Override system prompt (e.g. for summary mode)
 * @param {Function} [opts.onRetry] - Called with (attempt, error) before each retry
 */
export async function extractWithChat(apiKey, rawText, model = 'gpt-4o-mini', opts = {}) {
  const systemPrompt = opts.systemPrompt || EXTRACTION_PROMPT;
  const onRetry = opts.onRetry;

  return withRetry(async () => {
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
            { role: 'system', content: systemPrompt },
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
      const err = new Error(
        status === 401 ? 'Invalid API key. Check your OpenAI API key in settings.' :
        status === 429 ? 'Rate limited. Please wait a moment and try again.' :
        status === 402 || status === 403 ? 'API quota exceeded. Check your OpenAI billing.' :
        await getErrorMessage(response, status)
      );
      err.statusCode = status;
      throw err;
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
  }, {}, onRetry);
}

async function getErrorMessage(response, status) {
  let message = response.statusText;
  try {
    const errBody = await response.json();
    if (errBody?.error?.message) message = errBody.error.message;
  } catch { /* ignore parse errors */ }
  return `OpenAI API error (${status}): ${message}`;
}
