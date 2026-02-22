import type { InvocationMode, StepName } from '../control-plane/types.js';

export interface SectionValidationEntry {
  found: boolean;
  confidence: number;
  lengthChars: number;
}

export interface AuditLedger {
  invocationId: string;
  timestamp: string;
  mode: InvocationMode;
  deterministic: boolean;
  workflow: string;
  requiredSteps: StepName[];
  executedSteps: StepName[];
  skippedSteps: StepName[];
  durationsMs: Record<string, number>;
  sectionValidation: Record<string, SectionValidationEntry>;
  passed: boolean;
  failureReason?: string;
}
