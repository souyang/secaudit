import { describe, it, expect } from 'vitest';
import { buildLedger } from '../ledger/ledger.js';
import type { WorkflowContext, WorkflowPlan, AnalyzeOptions } from '../control-plane/types.js';

function makeOptions(mode: 'command' | 'intent'): AnalyzeOptions {
  return {
    ticker: 'AAPL',
    year: 2023,
    mode,
    format: 'json',
    out: './out',
    source: 'sec',
    require: ['risk-factors', 'mdna', 'financials'],
    strict: mode === 'command',
    cache: true,
    invocationId: 'test_ledger_01',
  };
}

function makeContext(mode: 'command' | 'intent'): WorkflowContext {
  return {
    options: makeOptions(mode),
    rawContent: '',
    contentType: 'html',
    extractedText: '',
    sections: [
      { name: 'risk_factors', found: true, confidence: 0.95, startOffset: 0, endOffset: 100, lengthChars: 5000, content: '' },
      { name: 'mdna', found: true, confidence: 0.90, startOffset: 100, endOffset: 200, lengthChars: 3000, content: '' },
      { name: 'financials', found: true, confidence: 0.92, startOffset: 200, endOffset: 300, lengthChars: 4000, content: '' },
    ],
    analyses: [],
    stepResults: [
      { name: 'fetch', status: 'passed', durationMs: 300 },
      { name: 'extract', status: 'passed', durationMs: 200 },
      { name: 'locate_sections', status: 'passed', durationMs: 100 },
      { name: 'validate', status: 'passed', durationMs: 5 },
      { name: 'generate', status: 'passed', durationMs: 10 },
      { name: 'emit_ledger', status: 'passed', durationMs: 1 },
    ],
    overallSummary: [],
  };
}

function makePlan(skippedSteps: string[] = []): WorkflowPlan {
  return {
    steps: [],
    skippedSteps: skippedSteps as WorkflowPlan['skippedSteps'],
    confidenceThreshold: 0.75,
  };
}

describe('buildLedger', () => {
  describe('command mode', () => {
    it('marks ledger as deterministic', () => {
      const ledger = buildLedger(makeContext('command'), makePlan(), true);
      expect(ledger.deterministic).toBe(true);
      expect(ledger.mode).toBe('command');
    });

    it('records all steps as executed when none skipped', () => {
      const ledger = buildLedger(makeContext('command'), makePlan(), true);
      expect(ledger.executedSteps).toEqual([
        'fetch', 'extract', 'locate_sections', 'validate', 'generate', 'emit_ledger',
      ]);
      expect(ledger.skippedSteps).toEqual([]);
    });

    it('records step durations', () => {
      const ledger = buildLedger(makeContext('command'), makePlan(), true);
      expect(ledger.durationsMs.fetch).toBe(300);
      expect(ledger.durationsMs.extract).toBe(200);
      expect(ledger.durationsMs.validate).toBe(5);
    });

    it('records section validation details', () => {
      const ledger = buildLedger(makeContext('command'), makePlan(), true);
      expect(ledger.sectionValidation.risk_factors).toEqual({
        found: true, confidence: 0.95, lengthChars: 5000,
      });
      expect(ledger.sectionValidation.mdna.confidence).toBe(0.90);
      expect(ledger.sectionValidation.financials.lengthChars).toBe(4000);
    });

    it('records pass/fail status', () => {
      const passed = buildLedger(makeContext('command'), makePlan(), true);
      expect(passed.passed).toBe(true);
      expect(passed.failureReason).toBeUndefined();

      const failed = buildLedger(makeContext('command'), makePlan(), false, 'missing section');
      expect(failed.passed).toBe(false);
      expect(failed.failureReason).toBe('missing section');
    });

    it('includes invocation metadata', () => {
      const ledger = buildLedger(makeContext('command'), makePlan(), true);
      expect(ledger.invocationId).toBe('test_ledger_01');
      expect(ledger.workflow).toBe('analyze_10k_v1');
      expect(ledger.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('intent mode', () => {
    it('marks ledger as non-deterministic', () => {
      const ledger = buildLedger(makeContext('intent'), makePlan(), true);
      expect(ledger.deterministic).toBe(false);
      expect(ledger.mode).toBe('intent');
    });

    it('records skipped steps from the plan', () => {
      const ctx = makeContext('intent');
      ctx.stepResults = [
        { name: 'fetch', status: 'passed', durationMs: 300 },
        { name: 'extract', status: 'passed', durationMs: 200 },
        { name: 'locate_sections', status: 'passed', durationMs: 100 },
        { name: 'validate', status: 'skipped', durationMs: 0 },
        { name: 'generate', status: 'passed', durationMs: 10 },
        { name: 'emit_ledger', status: 'passed', durationMs: 1 },
      ];

      const ledger = buildLedger(ctx, makePlan(['validate']), true);
      expect(ledger.skippedSteps).toContain('validate');
      expect(ledger.executedSteps).not.toContain('validate');
      expect(ledger.executedSteps).toContain('generate');
    });

    it('records multiple skipped steps', () => {
      const ctx = makeContext('intent');
      ctx.stepResults = [
        { name: 'fetch', status: 'passed', durationMs: 300 },
        { name: 'extract', status: 'passed', durationMs: 200 },
        { name: 'locate_sections', status: 'passed', durationMs: 100 },
        { name: 'validate', status: 'skipped', durationMs: 0 },
        { name: 'generate', status: 'skipped', durationMs: 0 },
        { name: 'emit_ledger', status: 'passed', durationMs: 1 },
      ];

      const ledger = buildLedger(ctx, makePlan(['validate', 'generate']), true);
      expect(ledger.skippedSteps).toEqual(['validate', 'generate']);
      expect(ledger.executedSteps).toEqual(['fetch', 'extract', 'locate_sections', 'emit_ledger']);
    });
  });

  describe('command vs intent contrast', () => {
    it('command ledger always has requiredSteps == executedSteps when passed', () => {
      const ledger = buildLedger(makeContext('command'), makePlan(), true);
      expect(ledger.requiredSteps).toEqual(ledger.executedSteps);
      expect(ledger.skippedSteps).toEqual([]);
    });

    it('intent ledger may have executedSteps < requiredSteps', () => {
      const ctx = makeContext('intent');
      ctx.stepResults = [
        { name: 'fetch', status: 'passed', durationMs: 300 },
        { name: 'extract', status: 'passed', durationMs: 200 },
        { name: 'locate_sections', status: 'passed', durationMs: 100 },
        { name: 'validate', status: 'skipped', durationMs: 0 },
        { name: 'generate', status: 'skipped', durationMs: 0 },
        { name: 'emit_ledger', status: 'passed', durationMs: 1 },
      ];

      const ledger = buildLedger(ctx, makePlan(['validate', 'generate']), true);
      expect(ledger.executedSteps.length).toBeLessThan(ledger.requiredSteps.length);
      expect(ledger.deterministic).toBe(false);
    });
  });
});
