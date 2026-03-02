import { PRICING } from './constants.js';

/**
 * Calculate estimated cost for a reading session.
 * @param {string} chatModel - Chat model used
 * @param {string} ttsModel - TTS model used
 * @param {object} chatUsage - { promptTokens, completionTokens }
 * @param {number} ttsCharacters - Total characters sent to TTS
 * @returns {{ chatCost, ttsCost, totalCost, breakdown }}
 */
export function calculateCost(chatModel, ttsModel, chatUsage, ttsCharacters) {
  const chatPricing = PRICING[chatModel] || PRICING['gpt-4o-mini'];
  const ttsPricing = PRICING[ttsModel] || PRICING['tts-1'];

  const chatInputCost = chatUsage.promptTokens * chatPricing.input;
  const chatOutputCost = chatUsage.completionTokens * chatPricing.output;
  const chatCost = chatInputCost + chatOutputCost;
  const ttsCost = ttsCharacters * ttsPricing;
  const totalCost = chatCost + ttsCost;

  return {
    chatCost,
    ttsCost,
    totalCost,
    breakdown: {
      promptTokens: chatUsage.promptTokens,
      completionTokens: chatUsage.completionTokens,
      ttsCharacters,
      chatModel,
      ttsModel,
    },
  };
}

/**
 * Format cost as a readable string.
 */
export function formatCost(cost) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(cost);
}
