import { Command } from 'commander';
import { generateInvocationId } from '../utils/id.js';
import { runWorkflow } from '../control-plane/orchestrator.js';
import { routeIntent } from '../intent-router/router.js';
import type { AnalyzeOptions, InvocationMode } from '../control-plane/types.js';

const DEFAULT_REQUIRE = ['risk-factors', 'mdna', 'financials'];

export function buildCli(): Command {
  const program = new Command();

  program
    .name('secaudit')
    .description(
      'Deterministic 10-K filing analyzer.\n\n' +
      'Demonstrates command-driven (deterministic) vs intent-based (probabilistic) invocation.\n' +
      'Processes public SEC 10-K filings and produces structured analysis with an audit ledger.'
    )
    .version('0.1.0');

  program
    .command('analyze-10k')
    .description('Analyze a 10-K filing with full workflow enforcement')
    .requiredOption('--ticker <string>', 'Company ticker symbol (e.g., AAPL)')
    .requiredOption('--year <number>', 'Filing year', parseInt)
    .option('--mode <mode>', 'Invocation mode: command or intent', 'command')
    .option('--format <format>', 'Output format: json or md', 'json')
    .option('--out <path>', 'Output directory', './out')
    .option('--source <source>', 'Fetch source: sec, edgar-archive, or url', 'sec')
    .option('--url <string>', 'Direct filing URL (overrides ticker/year lookup)')
    .option('--require <list>', 'Required sections (comma-separated)', DEFAULT_REQUIRE.join(','))
    .option('--no-strict', 'Disable strict parsing thresholds')
    .option('--no-cache', 'Disable document caching')
    .option('--invocation-id <string>', 'Explicit invocation ID')
    .action(async (opts) => {
      const options: AnalyzeOptions = {
        ticker: opts.ticker.toUpperCase(),
        year: opts.year,
        mode: opts.mode as InvocationMode,
        format: opts.format,
        out: opts.out,
        source: opts.source,
        url: opts.url,
        require: opts.require.split(',').map((s: string) => s.trim()),
        strict: opts.strict !== false,
        cache: opts.cache !== false,
        invocationId: opts.invocationId || generateInvocationId(),
      };

      await runWorkflow(options);
    });

  program
    .command('intent')
    .description('Analyze a filing via natural language intent (probabilistic mode)')
    .argument('<text>', 'Natural language request (e.g., "analyze apple 10-k 2023 risks")')
    .option('--llm', 'Use OpenAI GPT to route intent (requires OPENAI_API_KEY)')
    .option('--model <model>', 'OpenAI model to use with --llm (default: gpt-4o-mini)', 'gpt-4o-mini')
    .option('--format <format>', 'Output format: json or md', 'json')
    .option('--out <path>', 'Output directory', './out')
    .option('--ticker <string>', 'Optional ticker override')
    .option('--year <number>', 'Optional year override', parseInt)
    .option('--no-cache', 'Disable document caching')
    .option('--invocation-id <string>', 'Explicit invocation ID')
    .action(async (text: string, opts) => {
      const overrides = {
        ticker: opts.ticker?.toUpperCase(),
        year: opts.year,
      };

      let resolved;
      if (opts.llm) {
        const { routeIntentWithLlm } = await import('../intent-router/llm-router.js');
        resolved = await routeIntentWithLlm(text, overrides, opts.model);
      } else {
        resolved = routeIntent(text, overrides);
      }

      const options: AnalyzeOptions = {
        ticker: resolved.ticker,
        year: resolved.year,
        mode: 'intent',
        format: opts.format,
        out: opts.out,
        source: 'sec',
        require: resolved.requiredSections,
        strict: false,
        cache: opts.cache !== false,
        invocationId: opts.invocationId || generateInvocationId(),
      };

      await runWorkflow(options, resolved.plan);
    });

  return program;
}
