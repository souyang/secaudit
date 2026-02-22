import { buildWorkflow } from '../control-plane/workflow.js';
import { extractTicker, extractYear, extractIntentSignals } from './patterns.js';
import type { AnalyzeOptions, WorkflowPlan, StepName } from '../control-plane/types.js';

interface IntentOverrides {
  ticker?: string;
  year?: number;
}

export interface IntentResult {
  ticker: string;
  year: number;
  requiredSections: string[];
  plan: WorkflowPlan;
}

/**
 * Routes a natural language intent to a workflow plan using keyword heuristics.
 *
 * Uses Math.random() to simulate the probabilistic nature of intent-based routing.
 * For real LLM-based routing, use routeIntentWithLlm() via the --llm flag.
 */
export function routeIntent(text: string, overrides: IntentOverrides): IntentResult {
  const ticker = overrides.ticker ?? extractTicker(text);
  const year = overrides.year ?? extractYear(text);

  if (!ticker) {
    throw new Error(
      'Could not determine ticker from intent. ' +
      'Try: secaudit intent "analyze AAPL 10-K 2023", ' +
      'or provide --ticker explicitly.'
    );
  }
  if (!year) {
    throw new Error(
      'Could not determine year from intent. ' +
      'Try including a year like "2023" or provide --year explicitly.'
    );
  }

  const signals = extractIntentSignals(text);
  const requiredSections = resolveRequiredSections(signals);

  const stubOptions: AnalyzeOptions = {
    ticker,
    year,
    mode: 'intent',
    format: 'json',
    out: './out',
    source: 'sec',
    require: requiredSections,
    strict: false,
    cache: true,
    invocationId: '',
  };

  const plan = buildWorkflow(stubOptions);

  const skipped = computeProbabilisticSkips(signals);
  plan.skippedSteps = skipped;

  console.log(`  [intent] Router: heuristic (keyword-based)`);
  console.log(`  [intent] Resolved: ticker=${ticker} year=${year}`);
  console.log(`  [intent] Sections: ${requiredSections.join(', ')}`);
  if (skipped.length > 0) {
    console.log(`  [intent] Probabilistic skips: ${skipped.join(', ')}`);
  }

  return { ticker, year, requiredSections, plan };
}

function resolveRequiredSections(signals: ReturnType<typeof extractIntentSignals>): string[] {
  if (signals.isVague) {
    return ['risk-factors', 'mdna', 'financials'];
  }

  const sections: string[] = [];
  if (signals.wantsRiskFactors) sections.push('risk-factors');
  if (signals.wantsMdna) sections.push('mdna');
  if (signals.wantsFinancials) sections.push('financials');

  return sections.length > 0 ? sections : ['risk-factors', 'mdna', 'financials'];
}

/**
 * Simulates the probabilistic nature of intent-based invocation.
 *
 * - ~50% chance: validation is skipped entirely
 * - ~40% chance for vague intents: section location is also skipped
 * - ~20% chance: generate step is skipped (output has no summaries)
 *
 * For real LLM-based probabilistic routing, use --llm flag instead.
 */
function computeProbabilisticSkips(signals: ReturnType<typeof extractIntentSignals>): StepName[] {
  const skips: StepName[] = [];

  if (Math.random() < 0.5) {
    skips.push('validate');
  }

  if (signals.isVague && Math.random() < 0.4) {
    skips.push('locate_sections');
  }

  if (Math.random() < 0.2) {
    skips.push('generate');
  }

  return skips;
}
