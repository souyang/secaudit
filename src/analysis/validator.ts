import { matchesSectionKey } from './locator.js';
import type { SectionMatch } from '../control-plane/types.js';

const MIN_SECTION_LENGTH = 500;

export function validateSections(
  sections: SectionMatch[],
  requiredKeys: string[],
  confidenceThreshold: number,
  hardFail: boolean
): void {
  const failures: string[] = [];

  for (const reqKey of requiredKeys) {
    const section = sections.find((s) => matchesSectionKey(s.name, reqKey));

    if (!section || !section.found) {
      failures.push(`Section "${reqKey}" not found in filing`);
      continue;
    }

    if (section.confidence < confidenceThreshold) {
      failures.push(
        `Section "${reqKey}" confidence ${section.confidence.toFixed(2)} ` +
        `below threshold ${confidenceThreshold.toFixed(2)}`
      );
    }

    if (section.lengthChars < MIN_SECTION_LENGTH) {
      failures.push(
        `Section "${reqKey}" too short (${section.lengthChars} chars, ` +
        `minimum ${MIN_SECTION_LENGTH})`
      );
    }
  }

  if (failures.length > 0) {
    const message = `Validation failed:\n  - ${failures.join('\n  - ')}`;
    if (hardFail) {
      throw new Error(message);
    }
    console.warn(`  [warn] ${message}`);
  }
}
