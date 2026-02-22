import { describe, it, expect } from 'vitest';
import { extractTicker, extractYear, extractIntentSignals } from '../intent-router/patterns.js';

describe('extractTicker', () => {
  it('resolves known company names to tickers', () => {
    expect(extractTicker('analyze apple 10-k')).toBe('AAPL');
    expect(extractTicker('tesla risk factors')).toBe('TSLA');
    expect(extractTicker('look at google financials')).toBe('GOOGL');
    expect(extractTicker('microsoft annual report')).toBe('MSFT');
    expect(extractTicker('amazon revenue trends')).toBe('AMZN');
    expect(extractTicker('nvidia earnings')).toBe('NVDA');
    expect(extractTicker('meta discussion')).toBe('META');
    expect(extractTicker('facebook risks')).toBe('META');
  });

  it('resolves raw ticker symbols', () => {
    expect(extractTicker('AAPL 10-K 2023')).toBe('AAPL');
    expect(extractTicker('TSLA filing')).toBe('TSLA');
    expect(extractTicker('GOOG annual')).toBe('GOOGL');
  });

  it('falls back to generic uppercase words', () => {
    expect(extractTicker('analyze XYZ 10-K')).toBe('XYZ');
  });

  it('filters out stop words', () => {
    expect(extractTicker('the annual report')).toBeNull();
    expect(extractTicker('for all companies')).toBeNull();
  });

  it('returns null when no ticker found', () => {
    expect(extractTicker('show me something interesting')).toBeNull();
  });
});

describe('extractYear', () => {
  it('extracts a single year', () => {
    expect(extractYear('10-K for 2023')).toBe(2023);
    expect(extractYear('filing year 2022')).toBe(2022);
  });

  it('returns the most recent year when multiple present', () => {
    expect(extractYear('compare 2021 and 2023')).toBe(2023);
    expect(extractYear('from 2019 to 2023 trends')).toBe(2023);
  });

  it('returns null when no year found', () => {
    expect(extractYear('analyze the latest filing')).toBeNull();
    expect(extractYear('risk factors summary')).toBeNull();
  });

  it('does not match years outside 2010-2039', () => {
    expect(extractYear('founded in 1999')).toBeNull();
    expect(extractYear('projection for 2045')).toBeNull();
  });
});

describe('extractIntentSignals', () => {
  it('detects risk factor intent', () => {
    const signals = extractIntentSignals('summarize risk factors for apple');
    expect(signals.wantsRiskFactors).toBe(true);
    expect(signals.isVague).toBe(false);
  });

  it('detects MD&A intent', () => {
    const signals = extractIntentSignals('show me management discussion and analysis');
    expect(signals.wantsMdna).toBe(true);
  });

  it('detects financial intent', () => {
    const signals = extractIntentSignals('what are the financial highlights');
    expect(signals.wantsFinancials).toBe(true);
  });

  it('detects specific item references', () => {
    expect(extractIntentSignals('item 1a details').wantsRiskFactors).toBe(true);
    expect(extractIntentSignals('item 7 overview').wantsMdna).toBe(true);
    expect(extractIntentSignals('item 8 data').wantsFinancials).toBe(true);
  });

  it('marks vague intents correctly', () => {
    const signals = extractIntentSignals('tell me about apple 2023');
    expect(signals.isVague).toBe(true);
    expect(signals.wantsRiskFactors).toBe(false);
    expect(signals.wantsMdna).toBe(false);
    expect(signals.wantsFinancials).toBe(false);
  });

  it('detects multiple signals', () => {
    const signals = extractIntentSignals('risk factors and financial statements');
    expect(signals.wantsRiskFactors).toBe(true);
    expect(signals.wantsFinancials).toBe(true);
    expect(signals.isVague).toBe(false);
  });
});
