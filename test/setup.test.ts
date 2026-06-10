import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const setupPromptPath = fileURLToPath(new URL('../SETUP_PROMPT.md', import.meta.url));

test('SETUP_PROMPT.md carries the canonical block and the install spec', () => {
  const t = readFileSync(setupPromptPath, 'utf8');
  expect(t).toContain('# Markwise agent setup');
  expect(t).toContain('## Markwise'); // the canonical injected block heading
  expect(t).toContain('npm i -g github:farandclose/markwise'); // the single install spec (spec section 4)
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
