import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSetupOutput } from '../src/setup.js';

const setupPromptPath = fileURLToPath(new URL('../SETUP_PROMPT.md', import.meta.url));

test('SETUP_PROMPT.md carries the canonical block and the install spec', () => {
  const t = readFileSync(setupPromptPath, 'utf8');
  expect(t).toContain('# Markwise agent setup');
  expect(t).toContain('## Markwise'); // the canonical injected block heading
  expect(t).toContain('npm i -g markwise'); // the single install spec (spec section 4)
  expect(t).toContain('markwise preview <file>');
  expect(t).toContain('markwise prompt <file>');
  expect(t).toContain('never resolve notes yourself');
  expect(t).toContain('$HOME/.claude/CLAUDE.md');
  expect(t).toContain('AGENTS.md');
});

test('SETUP_PROMPT.md ships in the npm package', () => {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  expect(pkg.files).toContain('SETUP_PROMPT.md');
});

test('buildSetupOutput prepends the paste-able header and keeps the template verbatim', () => {
  const out = buildSetupOutput({ template: 'TEMPLATE BODY' });
  expect(out).toContain('To set up your coding agent, paste this into it:');
  expect(out).toContain(
    'Install Markwise for me with `npm i -g markwise`, then run `markwise agent-setup` and follow what it prints.'
  );
  expect(out).toContain('TEMPLATE BODY');
  // Header first, then the exact separator, then the template.
  expect(out).toContain('\n---\n\n');
  expect(out.indexOf('To set up')).toBeLessThan(out.indexOf('\n---\n\n'));
  expect(out.indexOf('\n---\n\n')).toBeLessThan(out.indexOf('TEMPLATE BODY'));
});

test('buildSetupOutput over the real SETUP_PROMPT.md yields the full followable doc', () => {
  const template = readFileSync(setupPromptPath, 'utf8');
  const out = buildSetupOutput({ template });
  expect(out).toContain('# Markwise agent setup');
  expect(out).toContain('## Markwise');
});
