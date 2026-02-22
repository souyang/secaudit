import { randomBytes } from 'node:crypto';

export function generateInvocationId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex');
  return `inv_${date}_${rand}`;
}
