import * as cheerio from 'cheerio';
import type { SectionMatch } from '../control-plane/types.js';

interface SectionPattern {
  key: string;
  requireKeys: string[];
  headingPatterns: RegExp[];
}

const SECTION_PATTERNS: SectionPattern[] = [
  {
    key: 'risk_factors',
    requireKeys: ['risk-factors', 'risk_factors'],
    headingPatterns: [
      /^item\s+1a[\.\s\-—–]+risk\s+factors/i,
      /^item\s+1a\b/i,
    ],
  },
  {
    key: 'mdna',
    requireKeys: ['mdna', 'md&a', 'mda'],
    headingPatterns: [
      /^item\s+7[\.\s\-—–]+management'?s?\s+discussion/i,
      /^item\s+7\b(?!\s*a)/i,
    ],
  },
  {
    key: 'financials',
    requireKeys: ['financials', 'financial-statements', 'financial_statements'],
    headingPatterns: [
      /^item\s+8[\.\s\-—–]+financial\s+statements/i,
      /^item\s+8\b/i,
    ],
  },
];

const NEXT_ITEM_HEADING = /^item\s+\d+[a-z]?[\.\s\-—–]/i;

export function locateSections(
  rawHtml: string,
  extractedText: string,
  contentType: 'html' | 'pdf' | 'text'
): SectionMatch[] {
  if (contentType === 'html') {
    return locateInHtml(rawHtml);
  }
  return locateInText(extractedText);
}

/**
 * SEC EDGAR HTML filings typically use a flat structure of `body > div` elements.
 * Each Item heading is a distinct div with short text like "Item 1A. Risk Factors".
 * We walk the sibling divs from the heading to the next Item heading,
 * extracting all text content in between.
 */
function locateInHtml(html: string): SectionMatch[] {
  const $ = cheerio.load(html);
  const results: SectionMatch[] = [];

  const bodyDivs = $('body > div').toArray();

  for (const pattern of SECTION_PATTERNS) {
    const match = findSectionByDomSiblings($, bodyDivs, pattern);
    results.push(match);
  }

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSectionByDomSiblings(
  $: cheerio.CheerioAPI,
  bodyDivs: any[],
  pattern: SectionPattern
): SectionMatch {
  let headingIdx = -1;
  let confidence = 0;

  for (let i = 0; i < bodyDivs.length; i++) {
    const text = $(bodyDivs[i]).text().replace(/\s+/g, ' ').trim();
    if (text.length > 150 || text.length < 3) continue;

    for (let pi = 0; pi < pattern.headingPatterns.length; pi++) {
      if (pattern.headingPatterns[pi].test(text)) {
        headingIdx = i;
        confidence = pi === 0 ? 0.95 : 0.90;
        break;
      }
    }
    if (headingIdx >= 0) break;
  }

  if (headingIdx < 0) {
    return makeNotFound(pattern.key);
  }

  const contentBlocks: string[] = [];
  let endIdx = bodyDivs.length;

  for (let i = headingIdx + 1; i < bodyDivs.length; i++) {
    const text = $(bodyDivs[i]).text().replace(/\s+/g, ' ').trim();

    if (text.length < 100 && NEXT_ITEM_HEADING.test(text)) {
      endIdx = i;
      break;
    }

    if (text.length > 2) {
      contentBlocks.push(text);
    }
  }

  const content = contentBlocks.join('\n');

  return {
    name: pattern.key,
    found: true,
    confidence,
    startOffset: headingIdx,
    endOffset: endIdx,
    lengthChars: content.length,
    content,
  };
}

function locateInText(text: string): SectionMatch[] {
  const allPatterns = [
    ...SECTION_PATTERNS.map((p) => ({
      ...p,
      headingPatterns: p.headingPatterns.map(
        (r) => new RegExp(r.source.replace(/^\^/, ''), r.flags)
      ),
    })),
  ];

  return allPatterns.map((pattern) => {
    for (let pi = 0; pi < pattern.headingPatterns.length; pi++) {
      const match = pattern.headingPatterns[pi].exec(text);
      if (match) {
        const confidence = pi === 0 ? 0.90 : 0.85;
        const startOffset = match.index;
        const sectionContent = extractTextSection(text, startOffset);

        return {
          name: pattern.key,
          found: true,
          confidence,
          startOffset,
          endOffset: startOffset + sectionContent.length,
          lengthChars: sectionContent.length,
          content: sectionContent,
        };
      }
    }
    return makeNotFound(pattern.key);
  });
}

function extractTextSection(text: string, startOffset: number): string {
  const afterHeading = text.slice(startOffset);
  const lines = afterHeading.split('\n');

  let endIdx = -1;
  for (let i = 3; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length < 3) continue;

    if (NEXT_ITEM_HEADING.test(trimmed) && trimmed.length < 150) {
      endIdx = i;
      break;
    }
  }

  const sectionLines = endIdx > 0 ? lines.slice(0, endIdx) : lines.slice(0, 800);
  const content = sectionLines.join('\n').trim();

  if (content.length > 100_000) {
    return content.slice(0, 100_000);
  }
  return content;
}

function makeNotFound(name: string): SectionMatch {
  return {
    name,
    found: false,
    confidence: 0,
    startOffset: -1,
    endOffset: -1,
    lengthChars: 0,
    content: '',
  };
}

export function matchesSectionKey(sectionName: string, requireKey: string): boolean {
  const pattern = SECTION_PATTERNS.find((p) => p.key === sectionName);
  if (!pattern) return false;
  return pattern.requireKeys.includes(requireKey.toLowerCase());
}
