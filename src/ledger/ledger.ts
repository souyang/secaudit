import type { WorkflowContext, WorkflowPlan, StepName } from '../control-plane/types.js';
import type { AuditLedger } from './types.js';

const ALL_REQUIRED_STEPS: StepName[] = [
  'fetch',
  'extract',
  'locate_sections',
  'validate',
  'generate',
  'emit_ledger',
];

export function buildLedger(
  ctx: WorkflowContext,
  plan: WorkflowPlan,
  passed: boolean,
  failureReason?: string
): AuditLedger {
  const durationsMs: Record<string, number> = {};
  const executedSteps: StepName[] = [];
  const skippedSteps: StepName[] = [...plan.skippedSteps];

  for (const result of ctx.stepResults) {
    durationsMs[result.name] = result.durationMs;
    if (result.status === 'passed' || result.status === 'failed') {
      executedSteps.push(result.name);
    } else if (result.status === 'skipped' && !skippedSteps.includes(result.name)) {
      skippedSteps.push(result.name);
    }
  }

  const sectionValidation: Record<string, { found: boolean; confidence: number; lengthChars: number }> = {};
  for (const section of ctx.sections) {
    sectionValidation[section.name] = {
      found: section.found,
      confidence: section.confidence,
      lengthChars: section.lengthChars,
    };
  }

  return {
    invocationId: ctx.options.invocationId,
    timestamp: new Date().toISOString(),
    mode: ctx.options.mode,
    deterministic: ctx.options.mode === 'command',
    workflow: 'analyze_10k_v1',
    requiredSteps: ALL_REQUIRED_STEPS,
    executedSteps,
    skippedSteps,
    durationsMs,
    sectionValidation,
    passed,
    failureReason,
  };
}
