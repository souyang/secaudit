export type InvocationMode = 'command' | 'intent';
export type OutputFormat = 'json' | 'md';
export type FetchSource = 'sec' | 'edgar-archive' | 'url';

export interface AnalyzeOptions {
  ticker: string;
  year: number;
  mode: InvocationMode;
  format: OutputFormat;
  out: string;
  source: FetchSource;
  url?: string;
  require: string[];
  strict: boolean;
  cache: boolean;
  invocationId: string;
}

export type StepName =
  | 'fetch'
  | 'extract'
  | 'locate_sections'
  | 'validate'
  | 'generate'
  | 'emit_ledger';

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface StepResult {
  name: StepName;
  status: StepStatus;
  durationMs: number;
  error?: string;
}

export interface WorkflowStep {
  name: StepName;
  required: boolean;
  execute: (ctx: WorkflowContext) => Promise<void>;
}

export interface SectionMatch {
  name: string;
  found: boolean;
  confidence: number;
  startOffset: number;
  endOffset: number;
  lengthChars: number;
  content: string;
}

export interface SectionAnalysis {
  name: string;
  found: boolean;
  confidence: number;
  summary: string[];
  evidence: string[];
}

export interface WorkflowContext {
  options: AnalyzeOptions;
  rawContent: string;
  contentType: 'html' | 'pdf' | 'text';
  extractedText: string;
  sections: SectionMatch[];
  analyses: SectionAnalysis[];
  stepResults: StepResult[];
  overallSummary: string[];
}

export interface WorkflowPlan {
  steps: WorkflowStep[];
  skippedSteps: StepName[];
  confidenceThreshold: number;
}

export interface AnalysisOutput {
  invocationId: string;
  mode: InvocationMode;
  workflow: string;
  input: { ticker: string; year: number };
  sections: SectionAnalysis[];
  overallSummary: string[];
}
