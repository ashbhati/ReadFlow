/**
 * Split text into chunks at sentence boundaries.
 * @param {string} text - Text to split
 * @param {number} [maxChars=4096] - Maximum characters per chunk
 * @returns {string[]} Array of text chunks
 */
export function chunkText(text, maxChars = 4096) {
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g);

  // If regex doesn't match (no sentence-ending punctuation), force-split
  if (!sentences) {
    return forceSplit(text, maxChars);
  }

  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    // If a single sentence exceeds maxChars, force-split it
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      chunks.push(...forceSplit(sentence, maxChars));
      continue;
    }

    if (current.length + sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
      }
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Capture any trailing text not matched by the sentence regex
  const matched = sentences.join('');
  const remainder = text.slice(matched.length).trim();
  if (remainder) {
    if (chunks.length > 0 && chunks[chunks.length - 1].length + remainder.length + 1 <= maxChars) {
      chunks[chunks.length - 1] += ' ' + remainder;
    } else {
      chunks.push(...forceSplit(remainder, maxChars));
    }
  }

  return chunks;
}

/**
 * Force-split text that has no sentence boundaries.
 */
function forceSplit(text, maxChars) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars).trim());
  }
  return chunks.filter(Boolean);
}
