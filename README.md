# secaudit — Deterministic 10-K Filing Analyzer

A TypeScript CLI that demonstrates the difference between **command-driven (deterministic)** and **intent-based (probabilistic)** invocation using public SEC 10-K filings.

**Core thesis:** Intent-based invocation is probabilistic; command-driven invocation is deterministic and auditable.

## Quick Start

```bash
npm install
npm run dev -- analyze-10k --ticker AAPL --year 2023 --mode command
```

Output lands in `./out/`:
- `{invocationId}-analysis.json` — structured section analysis
- `{invocationId}-ledger.json` — audit ledger proving which steps ran

## Two Invocation Modes

### Command Mode (Deterministic)

Every required step must pass. Missing sections = hard failure (exit code 2). The audit ledger proves 100% step coverage.

```bash
# Deterministic analysis — fails loudly if anything is missing
npm run dev -- analyze-10k --ticker AAPL --year 2023 --mode command

# Markdown output
npm run dev -- analyze-10k --ticker TSLA --year 2023 --mode command --format md

# Direct URL override
npm run dev -- analyze-10k --ticker MSFT --year 2023 --source url \
  --url "https://www.sec.gov/Archives/edgar/data/..." --mode command
```

### Intent Mode (Probabilistic)

The system interprets natural language. Required steps may be skipped — the ledger exposes this gap.

```bash
# Heuristic intent routing — keyword-based, no API key needed
npm run dev -- intent "analyze apple 10-k for 2023 and summarize risks"

# Override ticker/year if intent parsing misses
npm run dev -- intent "summarize tesla financial risks" --ticker TSLA --year 2023
```

### LLM Intent Mode (Real GPT Routing)

For a realistic demonstration, you can route intent through OpenAI GPT-4o-mini. The LLM receives the list of workflow steps and decides which ones to run — no hints to skip.

```bash
# LLM decides which steps to execute
npm run dev -- intent "summarize apple 2023 risk factors" --llm

# Use a different model
npm run dev -- intent "summarize apple 2023 risk factors" --llm --model gpt-4o
```

This requires an `OPENAI_API_KEY`. See [Environment Setup](#environment-setup) below.

## Environment Setup

Copy the example file and add your key:

```bash
cp .env.example .env
```

Edit `.env`:

```
OPENAI_API_KEY=sk-your-key-here
```

The OpenAI key is **optional**. It is only needed for `--llm` mode. Command mode and heuristic intent mode work without any API keys — SEC EDGAR is a free public API that requires no authentication.

## CLI Reference

```
secaudit analyze-10k [options]     Deterministic workflow
secaudit intent <text> [options]   Probabilistic intent routing

Options (analyze-10k):
  --ticker <string>         Company ticker (e.g., AAPL, TSLA, MSFT)
  --year <number>           Filing year
  --mode <command|intent>   Invocation mode (default: command)
  --format <json|md>        Output format (default: json)
  --out <path>              Output directory (default: ./out)
  --source <sec|url>        Fetch source (default: sec)
  --url <string>            Direct filing URL
  --require <list>          Required sections (default: risk-factors,mdna,financials)
  --no-strict               Lower confidence thresholds
  --no-cache                Skip document cache
  --invocation-id <string>  Explicit invocation ID

Options (intent):
  --llm                     Route intent through OpenAI GPT (requires OPENAI_API_KEY)
  --model <model>           OpenAI model (default: gpt-4o-mini)
  --ticker <string>         Optional ticker override
  --year <number>           Optional year override
```

## Workflow: `analyze_10k_v1`

Six steps, executed in order:

| Step | Description | Command Mode | Intent Mode |
|------|-------------|-------------|-------------|
| fetch | Download filing from SEC EDGAR | Required | Required |
| extract | Parse HTML/PDF to text | Required | Required |
| locate_sections | Find Item 1A, 7, 8 headings | Required | May skip |
| validate | Check section presence & confidence | Required (hard fail) | May skip |
| generate | Extractive summarization | Required | Best-effort |
| emit_ledger | Write audit record | Always | Always |

## Audit Ledger

Every run produces a ledger showing exactly what happened:

```json
{
  "mode": "command",
  "deterministic": true,
  "requiredSteps": ["fetch", "extract", "locate_sections", "validate", "generate", "emit_ledger"],
  "executedSteps": ["fetch", "extract", "locate_sections", "validate", "generate", "emit_ledger"],
  "skippedSteps": [],
  "sectionValidation": {
    "risk_factors": { "found": true, "confidence": 0.95, "lengthChars": 68735 },
    "mdna": { "found": true, "confidence": 0.90, "lengthChars": 15092 },
    "financials": { "found": true, "confidence": 0.95, "lengthChars": 19148 }
  },
  "passed": true
}
```

In intent mode, you'll see `"deterministic": false` and potentially `"skippedSteps": ["validate"]` — making the reliability gap visible.

## Exit Codes

- `0` — success
- `1` — general error (network, parse failure)
- `2` — validation failure (missing required sections, command mode only)

## Architecture

```
src/
  cli/commands.ts           Commander setup + flag parsing
  control-plane/
    orchestrator.ts         Workflow engine: step sequencing + enforcement
    workflow.ts             Step definitions for analyze_10k_v1
    types.ts                Core type definitions
  intent-router/
    router.ts               Keyword-based intent classifier (no API key)
    llm-router.ts           OpenAI GPT intent router (optional, --llm flag)
    patterns.ts             Ticker/year extraction patterns
  tools/
    fetcher.ts              SEC EDGAR fetch + caching
    extractor.ts            HTML (cheerio) + PDF (pdfjs-dist) extraction
    cache.ts                File-based cache
  analysis/
    locator.ts              Section heading detection via DOM traversal
    validator.ts            Section presence + confidence validation
    summarizer.ts           Extractive keyword-scored summarization
  ledger/
    ledger.ts               Audit ledger builder
    types.ts                Ledger schema
  utils/
    id.ts                   Invocation ID generation
    timer.ts                Step timing
```

## Development

```bash
npm install
npm run typecheck    # Type-check without emitting
npm run build        # Build with tsup
npm test             # Run tests
```

## Data Source

Uses the [SEC EDGAR](https://www.sec.gov/developer) public API to fetch 10-K filings. No API key or authentication is required — EDGAR is a free, open government data source. All requests comply with SEC rate limits (<10 req/sec) and include a required User-Agent header with a contact email.

Fetched documents are cached in `.cache/` for offline use.
