import { describe, test, expect } from 'vitest';
import { lintText } from '../src/lint.js';

// One fixture per lint rule (LINT_SPEC.md). Each fixture is a minimal document crafted to trip
// exactly one rule. The harness asserts the target rule fires; `not` lists rules that must NOT
// fire (used where a neighbouring rule could plausibly be a false positive). This table IS the
// executable spec: adding a rule means adding a fixture here first.

interface Fixture {
  rule: string;
  name: string;
  doc: string;
  not?: string[];
}

// A reusable valid single-note (comment, point anchor) block - the baseline we mutate.
const cleanComment = `Hello world.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"Hello world."},"thread":[{"by":"reviewer","at":"2026-05-24T14:00","body":"why this?"}]}
-->`;

const fixtures: Fixture[] = [
  // ---- Tier 1: block envelope --------------------------------------------
  {
    rule: 'L101',
    name: 'two mw:log blocks',
    doc: `A.<!-- mw:c1 --> B.<!-- mw:c2 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->

<!-- mw:log v=1
{"id":"c2","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"B."},"thread":[{"by":"reviewer","at":"t","body":"y"}]}
-->`,
  },
  {
    rule: 'L102',
    name: 'two mw:archive blocks',
    doc: `Some prose.

<!-- mw:archive v=1
{"id":"a1","type":"comment","state":"resolved","at":"2026-05-25T10:00","summary":"clarified scope"}
-->

<!-- mw:archive v=1
{"id":"a2","type":"replace","state":"resolved","at":"2026-05-25T10:01","summary":"applied Q4"}
-->`,
  },
  {
    rule: 'L103',
    name: 'unterminated block (no closing -->)',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}`,
  },
  {
    rule: 'L104',
    name: 'paired-close form',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
<!-- /mw:log -->`,
  },
  {
    rule: 'L105',
    name: 'self-closed opener followed by records',
    doc: `<!-- mw:log v=1 -->
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}`,
  },
  {
    rule: 'L106',
    name: 'record-shaped JSON outside any block',
    doc: `Some prose here.
{"id":"x1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"p"},"thread":[]}`,
  },
  {
    rule: 'L107',
    name: 'unrecognized schema version',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=2
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L108',
    name: 'block not at end of file',
    doc: `<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"Trailing prose."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->

Trailing prose.<!-- mw:c1 -->`,
  },
  // ---- Tier 1: record syntax / schema ------------------------------------
  {
    rule: 'L110',
    name: 'invalid JSON line in block',
    doc: `<!-- mw:log v=1
{this is not valid json}
-->`,
  },
  {
    rule: 'L120',
    name: 'missing required key (thread)',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."}}
-->`,
  },
  {
    rule: 'L121',
    name: 'bad type value',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"question","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L122',
    name: 'bad state value',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"reopened","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L123',
    name: 'bad disp value',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"maybe","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L124',
    name: 'payload rule: insert without text',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"add"}]}
-->`,
    not: ['L144'],
  },
  {
    rule: 'L125',
    name: 'bad anchor: span missing hash',
    doc: `A <!-- mw:c1 -->word<!-- /mw:c1 --> b.

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","before":"A ","after":" b"},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L126',
    name: 'bad thread message: by not reviewer/agent',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"bob","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L130',
    name: 'raw --> inside a body value',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"arrow --> here"}]}
-->`,
  },
  // ---- Tier 1: ID and fence integrity ------------------------------------
  {
    rule: 'L140',
    name: 'duplicate id',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"y"}]}
-->`,
  },
  {
    rule: 'L141',
    name: 'record with no inline marker',
    doc: `A plain paragraph.

<!-- mw:log v=1
{"id":"c9","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"paragraph."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L142',
    name: 'inline marker with no record',
    doc: `A.<!-- mw:c9 -->

<!-- mw:log v=1
-->`,
  },
  {
    rule: 'L143',
    name: 'dangling fence: close without open',
    doc: `A word<!-- /mw:c1 --> b.

<!-- mw:log v=1
{"id":"c1","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"deadbeef","before":"A ","after":" b"},"thread":[{"by":"reviewer","at":"t","body":"cut"}]}
-->`,
  },
  {
    rule: 'L144',
    name: 'marker shape mismatch: insert as span',
    doc: `A <!-- mw:c1 -->word<!-- /mw:c1 --> b.

<!-- mw:log v=1
{"id":"c1","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"A "},"text":"new","thread":[{"by":"reviewer","at":"t","body":"add"}]}
-->`,
    not: ['L143'],
  },
  {
    rule: 'L145',
    name: 'marker inside a fenced code block',
    doc: `Intro.

~~~
<!-- mw:c1 -->
~~~

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"Intro."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->`,
  },
  {
    rule: 'L146',
    name: 'archived record still has an inline marker',
    doc: `A.<!-- mw:a1 -->

<!-- mw:archive v=1
{"id":"a1","type":"comment","state":"resolved","at":"t","summary":"done"}
-->`,
  },
  {
    rule: 'L147',
    name: 'overlapping suggested edits',
    doc: `<!-- mw:s1 -->AAAA<!-- mw:s2 -->BBBB<!-- /mw:s1 -->CCCC<!-- /mw:s2 -->

<!-- mw:log v=1
{"id":"s1","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"deadbeef","before":"","after":"CCCC"},"thread":[{"by":"reviewer","at":"t","body":"cut"}]}
{"id":"s2","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"deadbeef","before":"AAAA","after":""},"thread":[{"by":"reviewer","at":"t","body":"cut"}]}
-->`,
  },
  // ---- Tier 2: anchor health ---------------------------------------------
  {
    rule: 'L201',
    name: 'stale hash',
    doc: `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"deadbeef","before":"ships by ","after":" of next"},"text":"Q4","thread":[{"by":"reviewer","at":"t","body":"Q4"}]}
-->`,
    not: ['L202'],
  },
  {
    rule: 'L202',
    name: 'before/after context mismatch',
    doc: `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"9fc58f1a","before":"WRONG ","after":" of next"},"text":"Q4","thread":[{"by":"reviewer","at":"t","body":"Q4"}]}
-->`,
    not: ['L201'],
  },
  // ---- Tier 3: lifecycle consistency -------------------------------------
  {
    rule: 'L301',
    name: 'log record marked resolved',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"resolved","disp":"answered","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"q"},{"by":"agent","at":"t","body":"a"}]}
-->`,
  },
  {
    rule: 'L302',
    name: 'archive record not resolved',
    doc: `Prose.

<!-- mw:archive v=1
{"id":"a1","type":"comment","state":"open","at":"t","summary":"x"}
-->`,
  },
  {
    rule: 'L303',
    name: 'declined note with no agent reply',
    doc: `A.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"declined","anchor":{"kind":"point","before":"A."},"thread":[{"by":"reviewer","at":"t","body":"do x"}]}
-->`,
  },
  {
    rule: 'L304',
    name: 'answered disposition on an edit-type note',
    doc: `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"answered","anchor":{"kind":"span","hash":"9fc58f1a","before":"ships by ","after":" of next"},"text":"Q4","thread":[{"by":"reviewer","at":"t","body":"Q4"},{"by":"agent","at":"t","body":"done"}]}
-->`,
    not: ['L201', 'L202'],
  },
];

describe('lint rules - one fixture per rule', () => {
  for (const fx of fixtures) {
    test(`${fx.rule}: ${fx.name}`, () => {
      const findings = lintText(fx.doc);
      const rules = findings.map((f) => f.rule);
      expect(rules, `expected ${fx.rule} in [${rules.join(', ')}]`).toContain(fx.rule);
      for (const n of fx.not ?? []) {
        expect(rules, `did not expect ${n} in [${rules.join(', ')}]`).not.toContain(n);
      }
    });
  }
});

describe('clean documents produce no findings', () => {
  test('valid single comment note', () => {
    expect(lintText(cleanComment)).toEqual([]);
  });
});
