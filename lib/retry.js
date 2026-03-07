/**
 * Check if an error is retryable (429 rate limit or 5xx server error).
 */
export function isRetryableError(err) {
  if (err.statusCode >= 500) return true;
  if (err.statusCode === 429) return true;
  // Parse status code from error message like "API error (429): ..."
  const match = err.message?.match(/\((\d{3})\)/);
  if (match) {
    const code = parseInt(match[1]);
    if (code === 429 || code >= 500) return true;
  }
  return false;
}

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {object} [opts] - Options
 * @param {number} [opts.maxRetries=3] - Maximum retry attempts
 * @param {number} [opts.baseDelay=1000] - Base delay in ms (doubles each retry)
 * @param {Function} [onRetry] - Called with (attempt, error) before each retry
 * @returns {Promise<*>} Result of fn()
 */
export async function withRetry(fn, opts = {}, onRetry) {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelay ?? 1000;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !isRetryableError(err)) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      if (onRetry) onRetry(attempt + 1, err);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
