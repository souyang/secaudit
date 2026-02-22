import * as cheerio from 'cheerio';

export async function extractText(
  rawContent: string,
  contentType: 'html' | 'pdf' | 'text'
): Promise<string> {
  switch (contentType) {
    case 'html':
      return extractFromHtml(rawContent);
    case 'pdf':
      return extractFromPdf(rawContent);
    case 'text':
      return rawContent;
  }
}

function extractFromHtml(html: string): string {
  const $ = cheerio.load(html);

  $('script, style, noscript, meta, link').remove();

  const blocks: string[] = [];
  const seen = new Set<string>();

  $('p, td, th, li, h1, h2, h3, h4, h5, h6, dt, dd, blockquote').each((_, el) => {
    const text = $(el)
      .contents()
      .toArray()
      .map((n) => $(n).text())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 2 && !seen.has(text)) {
      seen.add(text);
      blocks.push(text);
    }
  });

  if (blocks.length === 0) {
    const body = $('body').text().replace(/\s+/g, ' ').trim();
    if (body.length > 0) return body;
    return $.text().replace(/\s+/g, ' ').trim();
  }

  return blocks.join('\n');
}

async function extractFromPdf(content: string): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const data = new Uint8Array(Buffer.from(content, 'binary'));
    const doc = await pdfjs.getDocument({ data }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item: Record<string, unknown>) => 'str' in item)
        .map((item: Record<string, unknown>) => item.str as string)
        .join(' ');
      pages.push(pageText);
    }

    return pages.join('\n\n');
  } catch (err) {
    throw new Error(
      `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}. ` +
      `Try providing an HTML filing URL instead.`
    );
  }
}
