import { fetchFiling } from '../tools/fetcher.js';
import { extractText } from '../tools/extractor.js';
import { locateSections } from '../analysis/locator.js';
import { validateSections } from '../analysis/validator.js';
import { generateAnalysis } from '../analysis/summarizer.js';
import type { AnalyzeOptions, WorkflowPlan, WorkflowStep } from './types.js';

const COMMAND_CONFIDENCE_THRESHOLD = 0.75;
const INTENT_CONFIDENCE_THRESHOLD = 0.5;

export function buildWorkflow(options: AnalyzeOptions): WorkflowPlan {
  const isCommand = options.mode === 'command';
  const threshold = isCommand
    ? COMMAND_CONFIDENCE_THRESHOLD
    : INTENT_CONFIDENCE_THRESHOLD;

  const steps: WorkflowStep[] = [
    {
      name: 'fetch',
      required: true,
      execute: async (ctx) => {
        const result = await fetchFiling(ctx.options);
        ctx.rawContent = result.content;
        ctx.contentType = result.contentType;
      },
    },
    {
      name: 'extract',
      required: true,
      execute: async (ctx) => {
        ctx.extractedText = await extractText(ctx.rawContent, ctx.contentType);
        if (ctx.extractedText.length < 1000) {
          throw new Error(
            `Extracted text too short (${ctx.extractedText.length} chars). Filing may be malformed.`
          );
        }
      },
    },
    {
      name: 'locate_sections',
      required: true,
      execute: async (ctx) => {
        ctx.sections = locateSections(ctx.rawContent, ctx.extractedText, ctx.contentType);
      },
    },
    {
      name: 'validate',
      required: isCommand,
      execute: async (ctx) => {
        validateSections(ctx.sections, ctx.options.require, threshold, isCommand);
      },
    },
    {
      name: 'generate',
      required: isCommand,
      execute: async (ctx) => {
        const result = generateAnalysis(ctx.sections, ctx.options.require);
        ctx.analyses = result.sections;
        ctx.overallSummary = result.overallSummary;
      },
    },
    {
      name: 'emit_ledger',
      required: true,
      execute: async () => {
        // Ledger emission is handled by the orchestrator after all steps complete.
      },
    },
  ];

  return { steps, skippedSteps: [], confidenceThreshold: threshold };
}
