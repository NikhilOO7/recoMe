// Re-export all utils from the shared utils package for backward compatibility.
// New code should import directly from '@utils'.
export {
  generateId,
  now,
  normalizeTopicKey,
  buildTopicKey,
  parseTopicKey,
  msAgo,
  olderThan,
  daysBetween,
  startOfDay,
  clamp,
  weightedAverage,
  dedupe,
  groupBy,
  topN,
  waitForElement,
  extractTextContent,
  extractDomain,
  isHttpUrl,
  omit,
  escapeHtml,
} from '@utils/index';
