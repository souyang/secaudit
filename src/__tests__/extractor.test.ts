import { describe, it, expect } from 'vitest';
import { extractText } from '../tools/extractor.js';

describe('extractText (HTML)', () => {
  it('extracts text from paragraphs', async () => {
    const html = '<html><body><p>Hello world</p><p>Second paragraph</p></body></html>';
    const text = await extractText(html, 'html');
    expect(text).toContain('Hello world');
    expect(text).toContain('Second paragraph');
  });

  it('strips script and style tags', async () => {
    const html = `
      <html><body>
        <script>var x = 1;</script>
        <style>.foo { color: red; }</style>
        <p>Visible content</p>
      </body></html>
    `;
    const text = await extractText(html, 'html');
    expect(text).toContain('Visible content');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('color: red');
  });

  it('extracts text from table cells', async () => {
    const html = `
      <html><body>
        <table><tr><td>Cell one</td><td>Cell two</td></tr></table>
      </body></html>
    `;
    const text = await extractText(html, 'html');
    expect(text).toContain('Cell one');
    expect(text).toContain('Cell two');
  });

  it('collapses whitespace', async () => {
    const html = '<html><body><p>  lots   of    spaces  </p></body></html>';
    const text = await extractText(html, 'html');
    expect(text).toContain('lots of spaces');
  });

  it('returns passthrough for text content type', async () => {
    const raw = 'This is plain text content.\nWith newlines.';
    const text = await extractText(raw, 'text');
    expect(text).toBe(raw);
  });

  it('handles empty HTML gracefully', async () => {
    const html = '<html><body></body></html>';
    const text = await extractText(html, 'html');
    expect(text).toBe('');
  });
});
