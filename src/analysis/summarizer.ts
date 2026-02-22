import type { SectionMatch, SectionAnalysis } from '../control-plane/types.js';
import { matchesSectionKey } from './locator.js';

const MAX_SUMMARY_POINTS = 5;
const MAX_EVIDENCE_SNIPPETS = 3;
const SENTENCE_END = /(?<=[.!?])\s+/;

interface AnalysisResult {
  sections: SectionAnalysis[];
  overallSummary: string[];
}

const RISK_KEYWORDS = [
  'risk', 'adverse', 'uncertainty', 'litigation', 'regulatory',
  'competition', 'cybersecurity', 'supply chain', 'economic',
  'volatility', 'liability', 'compliance', 'disruption',
];

const FINANCIAL_KEYWORDS = [
  'revenue', 'income', 'loss', 'margin', 'earnings', 'cash flow',
  'assets', 'liabilities', 'debt', 'capital', 'dividend',
  'operating', 'growth', 'decline', 'increase', 'decrease',
];

const MDNA_KEYWORDS = [
  'revenue', 'growth', 'margin', 'decline', 'increase', 'segment',
  'operating', 'strategy', 'outlook', 'trend', 'driver',
  'year-over-year', 'compared to', 'primarily due', 'result of',
];

export function generateAnalysis(
  sections: SectionMatch[],
  requiredKeys: string[]
): AnalysisResult {
  const analyses: SectionAnalysis[] = [];

  for (const reqKey of requiredKeys) {
    const section = sections.find((s) => matchesSectionKey(s.name, reqKey));

    if (!section || !section.found) {
      analyses.push({
        name: sectionKeyToName(reqKey),
        found: false,
        confidence: 0,
        summary: [],
        evidence: [],
      });
      continue;
    }

    const keywords = getKeywordsForSection(section.name);
    const sentences = splitSentences(section.content);
    const scored = scoreSentences(sentences, keywords);

    analyses.push({
      name: section.name,
      found: true,
      confidence: section.confidence,
      summary: scored.slice(0, MAX_SUMMARY_POINTS).map((s) => s.text),
      evidence: scored.slice(0, MAX_EVIDENCE_SNIPPETS).map((s) => truncate(s.text, 200)),
    });
  }

  const overallSummary = buildOverallSummary(analyses);
  return { sections: analyses, overallSummary };
}

interface ScoredSentence {
  text: string;
  score: number;
}

function scoreSentences(sentences: string[], keywords: string[]): ScoredSentence[] {
  const scored: ScoredSentence[] = sentences
    .filter((s) => s.length > 30 && s.length < 500)
    .map((text) => {
      const lower = text.toLowerCase();
      let score = 0;

      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          score += 1;
        }
      }

      if (/\$[\d,.]+/.test(text) || /\d+(\.\d+)?%/.test(text)) {
        score += 0.5;
      }

      return { text, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getKeywordsForSection(name: string): string[] {
  switch (name) {
    case 'risk_factors': return RISK_KEYWORDS;
    case 'mdna': return MDNA_KEYWORDS;
    case 'financials': return FINANCIAL_KEYWORDS;
    default: return [...RISK_KEYWORDS, ...FINANCIAL_KEYWORDS];
  }
}

function sectionKeyToName(key: string): string {
  const map: Record<string, string> = {
    'risk-factors': 'risk_factors',
    'risk_factors': 'risk_factors',
    'mdna': 'mdna',
    'md&a': 'mdna',
    'mda': 'mdna',
    'financials': 'financials',
    'financial-statements': 'financials',
    'financial_statements': 'financials',
  };
  return map[key.toLowerCase()] ?? key;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function buildOverallSummary(analyses: SectionAnalysis[]): string[] {
  const summary: string[] = [];
  const found = analyses.filter((a) => a.found);
  const missing = analyses.filter((a) => !a.found);

  if (found.length > 0) {
    summary.push(
      `Analyzed ${found.length} section(s): ${found.map((a) => a.name).join(', ')}.`
    );
  }

  if (missing.length > 0) {
    summary.push(
      `Missing section(s): ${missing.map((a) => a.name).join(', ')}.`
    );
  }

  for (const a of found) {
    if (a.summary.length > 0) {
      summary.push(`${a.name}: ${a.summary[0]}`);
    }
  }

  return summary;
}
