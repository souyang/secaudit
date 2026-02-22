import { describe, it, expect } from 'vitest';
import { generateAnalysis } from '../analysis/summarizer.js';
import type { SectionMatch } from '../control-plane/types.js';

function makeSection(name: string, content: string): SectionMatch {
  return {
    name,
    found: true,
    confidence: 0.95,
    startOffset: 0,
    endOffset: content.length,
    lengthChars: content.length,
    content,
  };
}

describe('generateAnalysis', () => {
  const riskContent = [
    'The company faces significant risk from market volatility and economic downturns.',
    'Regulatory changes in key markets could adversely impact business operations.',
    'Competition from larger firms poses a risk to market share and profitability.',
    'Cybersecurity threats represent a growing area of uncertainty and potential liability.',
    'Supply chain disruption could lead to adverse effects on production timelines.',
    'Short line.',
    'Litigation risk remains elevated due to ongoing compliance investigations.',
  ].join(' ');

  const mdnaContent = [
    'Revenue increased 15% year-over-year driven primarily by growth in services.',
    'Operating margin declined to 28% compared to 30% in the prior year.',
    'The services segment contributed $80 billion in revenue, a 22% increase.',
    'Research and development spending increased $2 billion as strategy shifted.',
    'Cash flow from operations reached $50 billion, representing a 10% increase.',
  ].join(' ');

  const sections: SectionMatch[] = [
    makeSection('risk_factors', riskContent),
    makeSection('mdna', mdnaContent),
  ];

  it('produces analysis for each required section', () => {
    const result = generateAnalysis(sections, ['risk-factors', 'mdna']);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].name).toBe('risk_factors');
    expect(result.sections[1].name).toBe('mdna');
  });

  it('generates non-empty summaries for sections with content', () => {
    const result = generateAnalysis(sections, ['risk-factors', 'mdna']);
    expect(result.sections[0].summary.length).toBeGreaterThan(0);
    expect(result.sections[1].summary.length).toBeGreaterThan(0);
  });

  it('caps summaries at 5 items', () => {
    const result = generateAnalysis(sections, ['risk-factors']);
    expect(result.sections[0].summary.length).toBeLessThanOrEqual(5);
  });

  it('caps evidence at 3 items', () => {
    const result = generateAnalysis(sections, ['risk-factors']);
    expect(result.sections[0].evidence.length).toBeLessThanOrEqual(3);
  });

  it('truncates evidence snippets to 200 chars', () => {
    const result = generateAnalysis(sections, ['risk-factors']);
    for (const e of result.sections[0].evidence) {
      expect(e.length).toBeLessThanOrEqual(200);
    }
  });

  it('handles missing sections gracefully', () => {
    const result = generateAnalysis(sections, ['risk-factors', 'financials']);
    const fin = result.sections.find((s) => s.name === 'financials')!;
    expect(fin.found).toBe(false);
    expect(fin.summary).toEqual([]);
    expect(fin.evidence).toEqual([]);
  });

  it('builds an overall summary', () => {
    const result = generateAnalysis(sections, ['risk-factors', 'mdna']);
    expect(result.overallSummary.length).toBeGreaterThan(0);
    expect(result.overallSummary[0]).toContain('Analyzed 2 section(s)');
  });

  it('mentions missing sections in overall summary', () => {
    const result = generateAnalysis(sections, ['risk-factors', 'financials']);
    const missingSummary = result.overallSummary.find((s) => s.includes('Missing'));
    expect(missingSummary).toBeDefined();
    expect(missingSummary).toContain('financials');
  });
});
