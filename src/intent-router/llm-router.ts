import OpenAI from 'openai';
import { buildWorkflow } from '../control-plane/workflow.js';
import type { AnalyzeOptions, WorkflowPlan, StepName } from '../control-plane/types.js';

const ALL_STEPS: StepName[] = [
  'fetch', 'extract', 'locate_sections', 'validate', 'generate', 'emit_ledger',
];

const SYSTEM_PROMPT = `You are a workflow planner for a SEC 10-K filing analyzer.

Given a user's natural language request, decide which workflow steps to execute.

Available steps:
- fetch: Download the 10-K filing from SEC EDGAR
- extract: Parse the HTML/PDF document into text
- locate_sections: Find required sections (Risk Factors, MD&A, Financial Statements)
- validate: Verify that all required sections were found with sufficient confidence
- generate: Produce extractive summaries for each section
- emit_ledger: Write an audit record of what ran

Respond with ONLY a JSON object in this exact format:
{
  "ticker": "AAPL",
  "year": 2023,
  "steps": ["fetch", "extract", ...],
  "sections": ["risk-factors", "mdna", "financials"],
  "reasoning": "brief explanation of your choices"
}

Given the user's request, select only the steps needed to produce the requested output.
Not every request requires every step.`;

interface LlmRouteResult {
  ticker: string;
  year: number;
  requiredSections: string[];
  plan: WorkflowPlan;
  reasoning: string;
}

interface LlmResponse {
  ticker: string;
  year: number;
  steps: string[];
  sections: string[];
  reasoning: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function routeIntentWithLlm(
  text: string,
  overrides: { ticker?: string; year?: number },
  model?: string
): Promise<LlmRouteResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is required for --llm mode.\n' +
      'Set it with: export OPENAI_API_KEY=sk-...'
    );
  }

  const selectedModel = model ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });

  console.log(`  [llm] Sending intent to ${selectedModel}...`);

  const response = await client.chat.completions.create({
    model: selectedModel,
    temperature: 1.0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('LLM returned empty response');
  }

  let parsed: LlmResponse;
  try {
    parsed = JSON.parse(raw) as LlmResponse;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  const ticker = overrides.ticker ?? parsed.ticker;
  const year = overrides.year ?? parsed.year;

  if (!ticker) throw new Error('LLM could not determine ticker from intent');
  if (!year) throw new Error('LLM could not determine year from intent');

  const llmSteps = new Set(parsed.steps ?? []);
  const skippedSteps = ALL_STEPS.filter((s) => !llmSteps.has(s)) as StepName[];

  const sections = parsed.sections?.length > 0
    ? parsed.sections
    : ['risk-factors', 'mdna', 'financials'];

  const stubOptions: AnalyzeOptions = {
    ticker,
    year,
    mode: 'intent',
    format: 'json',
    out: './out',
    source: 'sec',
    require: sections,
    strict: false,
    cache: true,
    invocationId: '',
  };

  const plan = buildWorkflow(stubOptions);
  plan.skippedSteps = skippedSteps;

  console.log(`  [llm] Model: ${selectedModel}`);
  console.log(`  [llm] Resolved: ticker=${ticker} year=${year}`);
  console.log(`  [llm] Steps chosen: ${parsed.steps?.join(', ') ?? '(none)'}`);
  console.log(`  [llm] Sections: ${sections.join(', ')}`);
  if (skippedSteps.length > 0) {
    console.log(`  [llm] Skipped by LLM: ${skippedSteps.join(', ')}`);
  }
  console.log(`  [llm] Reasoning: ${parsed.reasoning}`);

  return { ticker, year, requiredSections: sections, plan, reasoning: parsed.reasoning };
}
