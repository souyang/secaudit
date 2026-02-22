import { describe, it, expect } from 'vitest';
import { locateSections, matchesSectionKey } from '../analysis/locator.js';

const MOCK_HTML = `
<html><body>
<div>Table of Contents</div>
<div>Item 1. Business</div>
<div>The company does many things. Business description paragraph one.</div>
<div>Business description paragraph two with more details about operations.</div>
<div>Item 1A. Risk Factors</div>
<div>The company faces significant risk from market volatility and regulatory changes that could adversely affect operations and financial results.</div>
<div>Competition in the technology sector is intense and the company may not be able to compete effectively against larger and more established competitors.</div>
<div>Supply chain disruptions could materially impact the company's ability to deliver products on time and within budget constraints.</div>
<div>Cybersecurity threats continue to evolve and any breach could result in significant liability and reputational damage to the company.</div>
<div>Item 1B. Unresolved Staff Comments</div>
<div>None.</div>
<div>Item 7. Management's Discussion and Analysis of Financial Condition</div>
<div>Revenue increased 15% year-over-year driven primarily by growth in the services segment and strong demand across all product categories.</div>
<div>Operating margin declined from 30% to 28% compared to the prior year primarily due to increased investment in research and development activities.</div>
<div>The company generated $50 billion in operating cash flow during the fiscal year representing a 10% increase over the prior period.</div>
<div>Item 7A. Quantitative and Qualitative Disclosures</div>
<div>Market risk discussion here.</div>
<div>Item 8. Financial Statements and Supplementary Data</div>
<div>Consolidated balance sheet showing total assets of $350 billion and total liabilities of $280 billion as of the fiscal year end.</div>
<div>Revenue for the fiscal year was $394 billion representing an increase of $42 billion or 12% compared to the prior fiscal year.</div>
<div>Net income was $97 billion or $6.13 per diluted share compared to $94 billion or $5.89 per diluted share in the prior year.</div>
<div>Item 9. Changes in and Disagreements with Accountants</div>
<div>None.</div>
</body></html>
`;

describe('locateSections (HTML mode)', () => {
  const sections = locateSections(MOCK_HTML, '', 'html');

  it('finds all three required sections', () => {
    expect(sections).toHaveLength(3);
    expect(sections.every((s) => s.found)).toBe(true);
  });

  it('finds risk_factors with high confidence', () => {
    const rf = sections.find((s) => s.name === 'risk_factors')!;
    expect(rf.found).toBe(true);
    expect(rf.confidence).toBeGreaterThanOrEqual(0.90);
    expect(rf.lengthChars).toBeGreaterThan(100);
    expect(rf.content).toContain('market volatility');
    expect(rf.content).toContain('Cybersecurity');
  });

  it('finds mdna with high confidence', () => {
    const mdna = sections.find((s) => s.name === 'mdna')!;
    expect(mdna.found).toBe(true);
    expect(mdna.confidence).toBeGreaterThanOrEqual(0.90);
    expect(mdna.content).toContain('Revenue increased');
    expect(mdna.content).toContain('Operating margin');
  });

  it('finds financials with high confidence', () => {
    const fin = sections.find((s) => s.name === 'financials')!;
    expect(fin.found).toBe(true);
    expect(fin.confidence).toBeGreaterThanOrEqual(0.90);
    expect(fin.content).toContain('balance sheet');
    expect(fin.content).toContain('Net income');
  });

  it('does not include content from the next section', () => {
    const rf = sections.find((s) => s.name === 'risk_factors')!;
    expect(rf.content).not.toContain('Revenue increased');

    const mdna = sections.find((s) => s.name === 'mdna')!;
    expect(mdna.content).not.toContain('balance sheet');
  });
});

describe('locateSections (plain text mode)', () => {
  const plainText = [
    'Some preamble text',
    'Item 1A. Risk Factors',
    'The company faces risk from economic downturns.',
    'Regulatory changes could affect business.',
    'Item 7. Management Discussion and Analysis',
    'Revenue grew 10% year over year.',
    'Operating expenses increased.',
    'Item 8. Financial Statements',
    'Total revenue was $100 billion.',
    'Net income was $25 billion.',
    'Item 9. Other Matters',
  ].join('\n');

  const sections = locateSections('', plainText, 'text');

  it('finds all three sections in plain text', () => {
    expect(sections).toHaveLength(3);
    expect(sections.every((s) => s.found)).toBe(true);
  });

  it('assigns slightly lower confidence for text mode', () => {
    for (const s of sections) {
      expect(s.confidence).toBeGreaterThanOrEqual(0.85);
      expect(s.confidence).toBeLessThanOrEqual(0.90);
    }
  });
});

describe('locateSections with missing section', () => {
  const htmlNoFinancials = `
<html><body>
<div>Item 1A. Risk Factors</div>
<div>Risk content here with enough text to pass validation checks.</div>
<div>Item 7. Management's Discussion and Analysis</div>
<div>MDNA content here with revenue and growth discussion.</div>
<div>Item 9. Other Stuff</div>
</body></html>
`;

  it('marks missing section as not found', () => {
    const sections = locateSections(htmlNoFinancials, '', 'html');
    const fin = sections.find((s) => s.name === 'financials')!;
    expect(fin.found).toBe(false);
    expect(fin.confidence).toBe(0);
    expect(fin.lengthChars).toBe(0);
  });
});

describe('matchesSectionKey', () => {
  it('matches canonical require keys to section names', () => {
    expect(matchesSectionKey('risk_factors', 'risk-factors')).toBe(true);
    expect(matchesSectionKey('risk_factors', 'risk_factors')).toBe(true);
    expect(matchesSectionKey('mdna', 'mdna')).toBe(true);
    expect(matchesSectionKey('mdna', 'md&a')).toBe(true);
    expect(matchesSectionKey('mdna', 'mda')).toBe(true);
    expect(matchesSectionKey('financials', 'financials')).toBe(true);
    expect(matchesSectionKey('financials', 'financial-statements')).toBe(true);
  });

  it('rejects mismatches', () => {
    expect(matchesSectionKey('risk_factors', 'mdna')).toBe(false);
    expect(matchesSectionKey('financials', 'risk-factors')).toBe(false);
    expect(matchesSectionKey('unknown', 'risk-factors')).toBe(false);
  });
});
