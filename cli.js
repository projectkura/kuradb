const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const distEntry = join(__dirname, 'dist', 'cli.js');
const srcEntry = join(__dirname, 'src', 'cli.ts');
const entry = existsSync(distEntry) ? distEntry : srcEntry;

void import(pathToFileURL(entry).href).catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exitCode = 1;
});
