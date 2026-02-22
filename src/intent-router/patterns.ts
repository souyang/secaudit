export const TICKER_PATTERNS: [RegExp, string][] = [
  [/\bAAPL\b/i, 'AAPL'],
  [/\bapple\b/i, 'AAPL'],
  [/\bGOOG(?:L)?\b/i, 'GOOGL'],
  [/\bgoogle\b/i, 'GOOGL'],
  [/\balphabet\b/i, 'GOOGL'],
  [/\bMSFT\b/i, 'MSFT'],
  [/\bmicrosoft\b/i, 'MSFT'],
  [/\bAMZN\b/i, 'AMZN'],
  [/\bamazon\b/i, 'AMZN'],
  [/\bTSLA\b/i, 'TSLA'],
  [/\btesla\b/i, 'TSLA'],
  [/\bMETA\b/i, 'META'],
  [/\bmeta\b/i, 'META'],
  [/\bfacebook\b/i, 'META'],
  [/\bNVDA\b/i, 'NVDA'],
  [/\bnvidia\b/i, 'NVDA'],
];

const GENERIC_TICKER = /\b([A-Z]{1,5})\b/;

export function extractTicker(text: string): string | null {
  for (const [pattern, ticker] of TICKER_PATTERNS) {
    if (pattern.test(text)) return ticker;
  }

  const match = GENERIC_TICKER.exec(text);
  if (match) {
    const candidate = match[1];
    const stopWords = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL',
      'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'SEC', 'PDF',
    ]);
    if (!stopWords.has(candidate) && candidate.length >= 2) {
      return candidate;
    }
  }

  return null;
}

export function extractYear(text: string): number | null {
  const yearPattern = /\b(20[1-3]\d)\b/g;
  let match;
  const years: number[] = [];
  while ((match = yearPattern.exec(text)) !== null) {
    years.push(parseInt(match[1], 10));
  }
  if (years.length === 0) return null;
  years.sort((a, b) => b - a);
  return years[0];
}

export interface IntentSignals {
  wantsRiskFactors: boolean;
  wantsMdna: boolean;
  wantsFinancials: boolean;
  isVague: boolean;
}

export function extractIntentSignals(text: string): IntentSignals {
  const lower = text.toLowerCase();
  return {
    wantsRiskFactors:
      lower.includes('risk') || lower.includes('item 1a'),
    wantsMdna:
      lower.includes('md&a') || lower.includes('discussion') ||
      lower.includes('management') || lower.includes('item 7'),
    wantsFinancials:
      lower.includes('financial') || lower.includes('revenue') ||
      lower.includes('earnings') || lower.includes('item 8') ||
      lower.includes('balance sheet'),
    isVague:
      !lower.includes('risk') && !lower.includes('financial') &&
      !lower.includes('md&a') && !lower.includes('discussion') &&
      !lower.includes('item'),
  };
}
