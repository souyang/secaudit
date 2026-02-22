#!/usr/bin/env node
import 'dotenv/config';
import { buildCli } from './cli/commands.js';

const program = buildCli();
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`secaudit: ${err.message}`);
  process.exit(1);
});
