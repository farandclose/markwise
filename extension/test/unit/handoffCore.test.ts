import { describe, it, expect } from 'vitest';
import { createNote } from 'markwise';
import { buildBriefing, posixQuote, composeLaunchCommand } from '../../src/handoffCore';

const TEMPLATE = '# Agent instructions\n\nFollow the notes. Time is <CURRENT_TIME>.\n';

describe('buildBriefing', () => {
  it('names the file, fills the time, lists the waiting note, and inlines the document', () => {
    // A fresh comment leaves the note waiting on the agent (reviewer spoke last).
    const source = createNote('# Plan\n\nThe quick brown fox.\n', {
      kind: 'span', start: 12, end: 17, body: 'rewrite this', at: '2026-01-01T00:00:00Z', type: 'comment',
    }).output;

    const briefing = buildBriefing(TEMPLATE, source, '/work/plan.md', '2026-06-21T10:00:00Z');

    expect(briefing).toContain('/work/plan.md'); // the agent is told which file
    expect(briefing).toContain('2026-06-21T10:00:00Z'); // <CURRENT_TIME> filled
    expect(briefing).not.toContain('<CURRENT_TIME>');
    expect(briefing).toMatch(/Notes waiting on you/i); // the waiting-notes section
    expect(briefing).toContain('# Plan'); // the document is inlined...
    expect(briefing).toContain('brown fox.'); // ...as raw source (the marker splits "quick")
    expect(briefing).toContain('mw:log'); // ...including its note records
  });
});

// Decode a string built from POSIX single-quoted segments and \' escapes (exactly the form
// posixQuote emits) back to its literal value - the inverse of posixQuote. If decoding the quoted
// argument returns the original text, then a shell sees one literal argument and nothing in it can
// start a new command: that IS the no-injection guarantee.
function shellDecode(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      i++;
      while (i < s.length && s[i] !== "'") out += s[i++];
      i++; // closing quote
    } else if (s[i] === '\\' && s[i + 1] === "'") {
      out += "'";
      i += 2;
    } else {
      out += s[i++];
    }
  }
  return out;
}

describe('posixQuote', () => {
  it('wraps in single quotes and escapes embedded single quotes', () => {
    expect(posixQuote('plain')).toBe("'plain'");
    expect(posixQuote("it's")).toBe("'it'\\''s'");
  });
});

describe('composeLaunchCommand', () => {
  it('produces "<agentCommand> <single-quoted prompt>"', () => {
    const cmd = composeLaunchCommand({
      agentCommand: 'claude',
      briefingPath: '/tmp/brief.md',
      docPath: '/work/plan.md',
    });
    expect(cmd.startsWith('claude ')).toBe(true);
    expect(cmd).toContain('/tmp/brief.md');
    expect(cmd).toContain('/work/plan.md');
  });

  it('posixQuote round-trips any hostile string (decode == original)', () => {
    for (const s of ["/tmp/p'; rm -rf ~ #.md", '$(whoami)', '`id`', 'a && b || c', "x'y'z", 'newline\nhere']) {
      expect(shellDecode(posixQuote(s))).toBe(s);
    }
  });

  it('a path with shell metacharacters cannot break out of the quoted argument (R7)', () => {
    const evil = "/tmp/p'; rm -rf ~ #.md";
    const cmd = composeLaunchCommand({ agentCommand: 'claude', briefingPath: evil, docPath: '/work/p.md' });
    const arg = cmd.slice('claude '.length);
    // The whole argument decodes to one literal prompt string - the injection is inert text, never a
    // second command, and the real path survives intact inside it.
    const decoded = shellDecode(arg);
    expect(decoded).toContain(evil); // the real path is preserved literally
    expect(decoded.startsWith('Read and follow the Markwise review briefing at ')).toBe(true);
    // And there is exactly one shell argument after the agent command (no token escaped the quotes).
    expect(arg.startsWith("'")).toBe(true);
    expect(arg.endsWith("'")).toBe(true);
  });
});
