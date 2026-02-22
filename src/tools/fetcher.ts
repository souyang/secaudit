import { cacheKey, urlCacheKey, readCache, writeCache } from './cache.js';
import type { AnalyzeOptions } from '../control-plane/types.js';

const SEC_USER_AGENT = 'secaudit-cli simonouyang@yahoo.com';
const SEC_RATE_LIMIT_MS = 120;

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < SEC_RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, SEC_RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function secFetch(url: string): Promise<Response> {
  await throttle();
  const res = await fetch(url, {
    headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'text/html,application/json' },
  });
  if (!res.ok) {
    throw new Error(`SEC request failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return res;
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

async function resolveCik(ticker: string): Promise<string> {
  const res = await secFetch('https://www.sec.gov/files/company_tickers.json');
  const data = (await res.json()) as Record<string, TickerEntry>;

  for (const entry of Object.values(data)) {
    if (entry.ticker.toUpperCase() === ticker.toUpperCase()) {
      return String(entry.cik_str).padStart(10, '0');
    }
  }

  throw new Error(`Ticker "${ticker}" not found in SEC company tickers`);
}

interface FilingRef {
  accessionNumber: string;
  primaryDocument: string;
  filingDate: string;
}

async function findFiling(cik: string, year: number): Promise<FilingRef> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await secFetch(url);
  const data = await res.json() as {
    filings: {
      recent: {
        form: string[];
        filingDate: string[];
        accessionNumber: string[];
        primaryDocument: string[];
      };
    };
  };

  const recent = data.filings.recent;

  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    if (form !== '10-K' && form !== '10-K/A') continue;

    const filingDate = recent.filingDate[i];
    const filingYear = parseInt(filingDate.slice(0, 4), 10);

    if (filingYear === year || filingYear === year + 1) {
      return {
        accessionNumber: recent.accessionNumber[i],
        primaryDocument: recent.primaryDocument[i],
        filingDate,
      };
    }
  }

  throw new Error(
    `No 10-K filing found for CIK ${cik} around year ${year}. ` +
    `Try a different --year or use --source url with a direct URL.`
  );
}

function buildDocUrl(cik: string, accession: string, primaryDoc: string): string {
  const accessionPath = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/${primaryDoc}`;
}

interface FetchResult {
  content: string;
  contentType: 'html' | 'pdf' | 'text';
}

function detectContentType(content: string, url: string): 'html' | 'pdf' | 'text' {
  if (url.endsWith('.pdf') || content.startsWith('%PDF')) return 'pdf';
  if (content.includes('<html') || content.includes('<HTML') || content.includes('<DOCUMENT>')) {
    return 'html';
  }
  return 'text';
}

export async function fetchFiling(options: AnalyzeOptions): Promise<FetchResult> {
  if (options.url) {
    return fetchByUrl(options.url, options.cache);
  }
  return fetchFromEdgar(options.ticker, options.year, options.cache);
}

async function fetchByUrl(url: string, useCache: boolean): Promise<FetchResult> {
  const key = urlCacheKey(url);

  if (useCache) {
    const cached = await readCache(key);
    if (cached) {
      console.log('    (cache hit)');
      return { content: cached, contentType: detectContentType(cached, url) };
    }
  }

  const res = await secFetch(url);
  const content = await res.text();

  if (useCache) {
    await writeCache(key, content);
  }

  return { content, contentType: detectContentType(content, url) };
}

async function fetchFromEdgar(
  ticker: string,
  year: number,
  useCache: boolean
): Promise<FetchResult> {
  const cik = await resolveCik(ticker);
  console.log(`    CIK: ${cik}`);

  const filing = await findFiling(cik, year);
  console.log(`    Filing: ${filing.accessionNumber} (${filing.filingDate})`);

  const key = cacheKey(ticker, year, filing.accessionNumber);

  if (useCache) {
    const cached = await readCache(key);
    if (cached) {
      console.log('    (cache hit)');
      return { content: cached, contentType: detectContentType(cached, '') };
    }
  }

  const docUrl = buildDocUrl(cik, filing.accessionNumber, filing.primaryDocument);
  console.log(`    URL: ${docUrl}`);

  const res = await secFetch(docUrl);
  const content = await res.text();

  if (useCache) {
    await writeCache(key, content);
  }

  return { content, contentType: detectContentType(content, docUrl) };
}
