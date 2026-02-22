import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_DIR = '.cache';

function sanitize(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function cacheKey(ticker: string, year: number, accession?: string): string {
  if (accession) {
    return `sec_${ticker}_${year}_${accession}`;
  }
  return `sec_${ticker}_${year}`;
}

export function urlCacheKey(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `url_${hash}`;
}

export async function readCache(key: string): Promise<string | null> {
  const path = join(CACHE_DIR, sanitize(key));
  try {
    await stat(path);
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function writeCache(key: string, content: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, sanitize(key));
  await writeFile(path, content, 'utf-8');
}
