import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StepTimer } from '../utils/timer.js';
import { buildLedger } from '../ledger/ledger.js';
import { buildWorkflow } from './workflow.js';
import type {
  AnalyzeOptions,
  WorkflowContext,
  WorkflowPlan,
  StepName,
} from './types.js';

export async function runWorkflow(
  options: AnalyzeOptions,
  intentPlan?: WorkflowPlan
): Promise<void> {
  const ctx: WorkflowContext = {
    options,
    rawContent: '',
    contentType: 'html',
    extractedText: '',
    sections: [],
    analyses: [],
    stepResults: [],
    overallSummary: [],
  };

  const plan = intentPlan ?? buildWorkflow(options);
  const skippedSet = new Set<StepName>(plan.skippedSteps);
  const timer = new StepTimer();

  console.log(
    `\n[secaudit] mode=${options.mode} workflow=analyze_10k_v1 id=${options.invocationId}`
  );
  console.log(
    `[secaudit] ticker=${options.ticker} year=${options.year} strict=${options.strict}\n`
  );

  for (const step of plan.steps) {
    if (skippedSet.has(step.name)) {
      ctx.stepResults.push({
        name: step.name,
        status: 'skipped',
        durationMs: 0,
      });
      console.log(`  [skip] ${step.name}`);
      continue;
    }

    timer.begin();
    console.log(`  [run]  ${step.name}...`);

    try {
      await step.execute(ctx);
      const duration = timer.elapsed();
      ctx.stepResults.push({
        name: step.name,
        status: 'passed',
        durationMs: duration,
      });
      console.log(`  [pass] ${step.name} (${duration}ms)`);
    } catch (err) {
      const duration = timer.elapsed();
      const message = err instanceof Error ? err.message : String(err);

      ctx.stepResults.push({
        name: step.name,
        status: 'failed',
        durationMs: duration,
        error: message,
      });
      console.error(`  [FAIL] ${step.name}: ${message}`);

      if (options.mode === 'command' && step.required) {
        await emitOutputs(ctx, plan, false, message);
        console.error(
          `\n[secaudit] FATAL: required step "${step.name}" failed in command mode`
        );
        printRemediation(step.name, message);
        process.exit(2);
      }
    }
  }

  await emitOutputs(ctx, plan, true);
  console.log(`\n[secaudit] done. Output written to ${options.out}/`);
}

async function emitOutputs(
  ctx: WorkflowContext,
  plan: WorkflowPlan,
  passed: boolean,
  failureReason?: string
): Promise<void> {
  const { options } = ctx;
  await mkdir(options.out, { recursive: true });

  const ledger = buildLedger(ctx, plan, passed, failureReason);
  const ledgerPath = join(options.out, `${options.invocationId}-ledger.json`);
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));

  if (passed) {
    const analysis = buildAnalysisOutput(ctx);
    const ext = options.format === 'md' ? 'md' : 'json';
    const analysisPath = join(options.out, `${options.invocationId}-analysis.${ext}`);

    if (options.format === 'md') {
      await writeFile(analysisPath, renderMarkdown(analysis));
    } else {
      await writeFile(analysisPath, JSON.stringify(analysis, null, 2));
    }
  }
}

function buildAnalysisOutput(ctx: WorkflowContext) {
  return {
    invocationId: ctx.options.invocationId,
    mode: ctx.options.mode,
    workflow: 'analyze_10k_v1',
    input: { ticker: ctx.options.ticker, year: ctx.options.year },
    sections: ctx.analyses,
    overallSummary: ctx.overallSummary,
  };
}

function renderMarkdown(analysis: ReturnType<typeof buildAnalysisOutput>): string {
  const lines: string[] = [
    `# 10-K Analysis: ${analysis.input.ticker} (${analysis.input.year})`,
    '',
    `**Mode:** ${analysis.mode}`,
    `**Workflow:** ${analysis.workflow}`,
    `**Invocation ID:** ${analysis.invocationId}`,
    '',
  ];

  for (const section of analysis.sections) {
    lines.push(`## ${formatSectionName(section.name)}`);
    lines.push('');
    lines.push(`**Found:** ${section.found} | **Confidence:** ${section.confidence}`);
    lines.push('');
    if (section.summary.length > 0) {
      lines.push('### Summary');
      for (const s of section.summary) {
        lines.push(`- ${s}`);
      }
      lines.push('');
    }
    if (section.evidence.length > 0) {
      lines.push('### Evidence');
      for (const e of section.evidence) {
        lines.push(`> ${e}`);
      }
      lines.push('');
    }
  }

  if (analysis.overallSummary.length > 0) {
    lines.push('## Overall Summary');
    lines.push('');
    for (const s of analysis.overallSummary) {
      lines.push(`- ${s}`);
    }
  }

  return lines.join('\n');
}

function formatSectionName(name: string): string {
  const map: Record<string, string> = {
    risk_factors: 'Risk Factors (Item 1A)',
    mdna: "Management's Discussion & Analysis (Item 7)",
    financials: 'Financial Statements (Item 8)',
  };
  return map[name] ?? name;
}

function printRemediation(stepName: StepName, error: string): void {
  console.error('\n[secaudit] Remediation suggestions:');
  if (stepName === 'fetch') {
    console.error('  - Try --source url --url <direct-filing-url>');
    console.error('  - Check ticker spelling and year availability');
  } else if (stepName === 'extract') {
    console.error('  - The filing format may be unsupported');
    console.error('  - Try a different --source or provide --url to an HTML filing');
  } else if (stepName === 'validate') {
    console.error('  - Try --no-strict to lower confidence thresholds');
    console.error('  - Try a different filing year');
    console.error(`  - Details: ${error}`);
  }
}
