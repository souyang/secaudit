import { describe, it, expect, vi } from 'vitest';
import { validateSections } from '../analysis/validator.js';
import type { SectionMatch } from '../control-plane/types.js';

function makeSection(overrides: Partial<SectionMatch> = {}): SectionMatch {
  return {
    name: 'risk_factors',
    found: true,
    confidence: 0.95,
    startOffset: 0,
    endOffset: 1000,
    lengthChars: 1000,
    content: 'x'.repeat(1000),
    ...overrides,
  };
}

describe('validateSections', () => {
  describe('command mode (hardFail=true)', () => {
    it('passes when all required sections are present and valid', () => {
      const sections = [
        makeSection({ name: 'risk_factors', confidence: 0.95, lengthChars: 5000 }),
        makeSection({ name: 'mdna', confidence: 0.90, lengthChars: 3000 }),
        makeSection({ name: 'financials', confidence: 0.92, lengthChars: 4000 }),
      ];

      expect(() =>
        validateSections(sections, ['risk-factors', 'mdna', 'financials'], 0.75, true)
      ).not.toThrow();
    });

    it('throws when a required section is not found', () => {
      const sections = [
        makeSection({ name: 'risk_factors' }),
        makeSection({ name: 'mdna', found: false, confidence: 0 }),
        makeSection({ name: 'financials' }),
      ];

      expect(() =>
        validateSections(sections, ['risk-factors', 'mdna', 'financials'], 0.75, true)
      ).toThrow(/not found/);
    });

    it('throws when confidence is below threshold', () => {
      const sections = [
        makeSection({ name: 'risk_factors', confidence: 0.50 }),
      ];

      expect(() =>
        validateSections(sections, ['risk-factors'], 0.75, true)
      ).toThrow(/confidence.*below threshold/);
    });

    it('throws when section is too short', () => {
      const sections = [
        makeSection({ name: 'risk_factors', lengthChars: 100 }),
      ];

      expect(() =>
        validateSections(sections, ['risk-factors'], 0.75, true)
      ).toThrow(/too short/);
    });

    it('reports all failures in one error', () => {
      const sections = [
        makeSection({ name: 'risk_factors', found: false }),
        makeSection({ name: 'financials', confidence: 0.50, lengthChars: 100 }),
      ];

      expect(() =>
        validateSections(
          sections, ['risk-factors', 'financials'], 0.75, true
        )
      ).toThrow(/not found.*\n.*confidence.*\n.*too short/s);
    });
  });

  describe('intent mode (hardFail=false)', () => {
    it('warns but does not throw when sections are missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sections = [
        makeSection({ name: 'risk_factors', found: false }),
      ];

      expect(() =>
        validateSections(sections, ['risk-factors'], 0.75, false)
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
      warnSpy.mockRestore();
    });

    it('does not warn when everything is valid', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sections = [
        makeSection({ name: 'risk_factors', confidence: 0.90, lengthChars: 5000 }),
      ];

      validateSections(sections, ['risk-factors'], 0.75, false);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
