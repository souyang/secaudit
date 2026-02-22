import { describe, it, expect } from 'vitest';
import { generateInvocationId } from '../utils/id.js';

describe('generateInvocationId', () => {
  it('starts with inv_ prefix', () => {
    const id = generateInvocationId();
    expect(id).toMatch(/^inv_/);
  });

  it('contains a date segment in YYYYMMDD format', () => {
    const id = generateInvocationId();
    expect(id).toMatch(/^inv_\d{8}_/);
  });

  it('contains a 6-char hex suffix', () => {
    const id = generateInvocationId();
    expect(id).toMatch(/^inv_\d{8}_[a-f0-9]{6}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateInvocationId()));
    expect(ids.size).toBe(50);
  });
});
