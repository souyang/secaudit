import { describe, it, expect } from 'vitest';
import { buildLedger } from '../ledger/ledger.js';
import { buildWorkflow } from '../control-plane/workflow.js';
import { routeIntent } from '../intent-router/router.js';
import type { AnalyzeOptions, WorkflowContext, StepName } from '../control-plane/types.js';

/**
 * End-to-end contrast tests proving the thesis:
 *   command mode = deterministic (all steps enforced)
 *   intent mode  = probabilistic (steps may be skipped)
 *
 * These tests don't hit the network — they verify the workflow plan
 * and ledger structure differences between the two modes.
 */

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
    invocationId: `test_${mode}`,
  };
}

describe('Command vs Intent mode contrast', () => {
  describe('workflow plan', () => {
    it('command mode: all steps are required, none skipped', () => {
      const plan = buildWorkflow(makeOptions('command'));
      expect(plan.skippedSteps).toEqual([]);
      expect(plan.steps.filter((s) => s.required)).toHaveLength(6);
    });

    it('command mode: validate step is required', () => {
      const plan = buildWorkflow(makeOptions('command'));
      const validate = plan.steps.find((s) => s.name === 'validate')!;
      expect(validate.required).toBe(true);
    });

    it('intent mode: validate step is NOT required', () => {
      const plan = buildWorkflow(makeOptions('intent'));
      const validate = plan.steps.find((s) => s.name === 'validate')!;
      expect(validate.required).toBe(false);
    });

    it('intent mode: generate step is NOT required', () => {
      const plan = buildWorkflow(makeOptions('intent'));
      const generate = plan.steps.find((s) => s.name === 'generate')!;
      expect(generate.required).toBe(false);
    });

    it('command mode: uses higher confidence threshold', () => {
      const plan = buildWorkflow(makeOptions('command'));
      expect(plan.confidenceThreshold).toBeGreaterThanOrEqual(0.75);
    });

    it('intent mode: uses lower confidence threshold', () => {
      const plan = buildWorkflow(makeOptions('intent'));
      expect(plan.confidenceThreshold).toBeLessThanOrEqual(0.5);
    });
  });

  describe('intent router probabilistic behavior', () => {
    it('may skip validation across multiple runs', () => {
      const results: boolean[] = [];

      for (let i = 0; i < 50; i++) {
        const resolved = routeIntent('analyze apple 10-k for 2023 risks', {});
        results.push(resolved.plan.skippedSteps.includes('validate'));
      }

      const skippedCount = results.filter(Boolean).length;
      expect(skippedCount).toBeGreaterThan(0);
      expect(skippedCount).toBeLessThan(50);
    });

    it('extracts ticker and year from natural language', () => {
      const resolved = routeIntent('analyze apple 10-k for 2023 risks', {});
      expect(resolved.ticker).toBe('AAPL');
      expect(resolved.year).toBe(2023);
    });

    it('respects explicit overrides', () => {
      const resolved = routeIntent('analyze something', {
        ticker: 'TSLA',
        year: 2022,
      });
      expect(resolved.ticker).toBe('TSLA');
      expect(resolved.year).toBe(2022);
    });

    it('narrows required sections based on intent', () => {
      const risksOnly = routeIntent('summarize apple 2023 risk factors', {});
      expect(risksOnly.requiredSections).toContain('risk-factors');
      expect(risksOnly.requiredSections).not.toContain('financials');
    });

    it('requests all sections for vague intents', () => {
      const vague = routeIntent('tell me about AAPL 2023', {});
      expect(vague.requiredSections).toContain('risk-factors');
      expect(vague.requiredSections).toContain('mdna');
      expect(vague.requiredSections).toContain('financials');
    });
  });

  describe('ledger contrast', () => {
    function makeLedgerContext(mode: 'command' | 'intent', skipped: StepName[] = []): {
      ctx: WorkflowContext;
      plan: ReturnType<typeof buildWorkflow>;
    } {
      const options = makeOptions(mode);
      const ctx: WorkflowContext = {
        options,
        rawContent: '',
        contentType: 'html',
        extractedText: '',
        sections: [
          { name: 'risk_factors', found: true, confidence: 0.95, startOffset: 0, endOffset: 100, lengthChars: 5000, content: '' },
          { name: 'mdna', found: true, confidence: 0.90, startOffset: 100, endOffset: 200, lengthChars: 3000, content: '' },
          { name: 'financials', found: true, confidence: 0.92, startOffset: 200, endOffset: 300, lengthChars: 4000, content: '' },
        ],
        analyses: [],
        stepResults: [],
        overallSummary: [],
      };

      const allSteps: StepName[] = ['fetch', 'extract', 'locate_sections', 'validate', 'generate', 'emit_ledger'];
      const skippedSet = new Set(skipped);
      ctx.stepResults = allSteps.map((name) => ({
        name,
        status: skippedSet.has(name) ? 'skipped' as const : 'passed' as const,
        durationMs: skippedSet.has(name) ? 0 : 100,
      }));

      const plan = buildWorkflow(options);
      plan.skippedSteps = skipped;
      return { ctx, plan };
    }

    it('command ledger: deterministic=true, all steps executed', () => {
      const { ctx, plan } = makeLedgerContext('command');
      const ledger = buildLedger(ctx, plan, true);

      expect(ledger.deterministic).toBe(true);
      expect(ledger.executedSteps).toHaveLength(6);
      expect(ledger.skippedSteps).toHaveLength(0);
      expect(ledger.requiredSteps).toEqual(ledger.executedSteps);
    });

    it('intent ledger: deterministic=false, may have skipped steps', () => {
      const { ctx, plan } = makeLedgerContext('intent', ['validate', 'generate']);
      const ledger = buildLedger(ctx, plan, true);

      expect(ledger.deterministic).toBe(false);
      expect(ledger.skippedSteps).toContain('validate');
      expect(ledger.skippedSteps).toContain('generate');
      expect(ledger.executedSteps.length).toBeLessThan(ledger.requiredSteps.length);
    });

    it('the gap between requiredSteps and executedSteps is only present in intent mode', () => {
      const cmd = makeLedgerContext('command');
      const cmdLedger = buildLedger(cmd.ctx, cmd.plan, true);

      const intent = makeLedgerContext('intent', ['validate']);
      const intentLedger = buildLedger(intent.ctx, intent.plan, true);

      const cmdGap = cmdLedger.requiredSteps.length - cmdLedger.executedSteps.length;
      const intentGap = intentLedger.requiredSteps.length - intentLedger.executedSteps.length;

      expect(cmdGap).toBe(0);
      expect(intentGap).toBeGreaterThan(0);
    });
  });
});
