// Tests for every diagnostic rule: one positive and one negative case per rule.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normaliseRecord } = require('../src/schema');
const { RULES, ruleCatalogue, getRule } = require('../src/rules');

function make(input, index = 0, file = 'data.json') {
  return normaliseRecord(input, { path: file, index });
}

function context(record, records, stats = {}) {
  return { record, records, stats };
}

function labelled(count, label, startIndex = 0) {
  const records = [];
  for (let i = 0; i < count; i += 1) {
    records.push(make({ id: `${label}-${i}`, text: `sample ${i}`, label }, startIndex + i));
  }
  return records;
}

const CASES = [
  {
    id: 'PD-DUP-001',
    positive: () => {
      const records = [make({ id: 'a', text: 'Same text' }, 0), make({ id: 'b', text: 'Same text' }, 1)];
      return context(records[1], records);
    },
    negative: () => {
      const records = [make({ id: 'a', text: 'First text' }, 0), make({ id: 'b', text: 'Second text' }, 1)];
      return context(records[1], records);
    }
  },
  {
    id: 'PD-DUP-002',
    positive: () => {
      const records = [make({ id: 'a', text: 'Hello world' }, 0), make({ id: 'b', text: 'hello world' }, 1)];
      return context(records[1], records);
    },
    negative: () => {
      const records = [make({ id: 'a', text: 'Hello world' }, 0), make({ id: 'b', text: 'Totally different' }, 1)];
      return context(records[1], records);
    }
  },
  {
    id: 'PD-CON-001',
    positive: () => {
      const record = make({ id: 'p', prompt: 'q?', chosen: 'same', rejected: 'same' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'p', prompt: 'q?', chosen: 'good', rejected: 'bad' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-CON-002',
    positive: () => {
      const records = [make({ id: 'same', text: 'One' }, 0), make({ id: 'same', text: 'Two' }, 1)];
      return context(records[1], records);
    },
    negative: () => {
      const records = [make({ id: 'same', text: 'One' }, 0), make({ id: 'same', text: 'One' }, 1)];
      return context(records[1], records);
    }
  },
  {
    id: 'PD-CON-003',
    positive: () => {
      const record = make({ id: 'p', prompt: 'q?', chosen: 'short', rejected: 'a much longer answer' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'p', prompt: 'q?', chosen: 'a much longer answer', rejected: 'short' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-BAL-001',
    positive: () => {
      const records = [...labelled(10, 'a'), ...labelled(1, 'b', 10)];
      return context(records[10], records);
    },
    negative: () => {
      const records = [...labelled(5, 'a'), ...labelled(5, 'b', 5)];
      return context(records[5], records);
    }
  },
  {
    id: 'PD-BAL-002',
    positive: () => {
      const records = [...labelled(10, 'a'), ...labelled(1, 'b', 10)];
      return context(records[0], records);
    },
    negative: () => {
      const records = [...labelled(5, 'a'), ...labelled(5, 'b', 5)];
      return context(records[0], records);
    }
  },
  {
    id: 'PD-FMT-001',
    positive: () => {
      const record = make({ id: 'x', text: '' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'has content' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-FMT-002',
    positive: () => {
      const record = make({ id: 'x', text: '   ' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'content' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-FMT-003',
    positive: () => {
      const record = make({ id: 'x', text: 'a'.repeat(100) });
      return context(record, [record], { maxChars: 10 });
    },
    negative: () => {
      const record = make({ id: 'x', text: 'a'.repeat(100) });
      return context(record, [record], { maxChars: 8000 });
    }
  },
  {
    id: 'PD-FMT-004',
    positive: () => {
      const record = make({
        id: 'x',
        messages: [
          { role: 'assistant', content: 'hi' },
          { role: 'user', content: 'hello' }
        ]
      });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({
        id: 'x',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' }
        ]
      });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-PRV-001',
    positive: () => {
      const record = make({ id: 'x', text: 'contact jane@example.com' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'no contact details' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-PRV-002',
    positive: () => {
      const record = make({ id: 'x', text: 'card 4111 1111 1111 1111' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'order 12345 shipped' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-PRV-003',
    positive: () => {
      const record = make({ id: 'x', text: 'call 555-123-4567' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'version 1.2.3' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-PRV-004',
    positive: () => {
      const record = make({ id: 'x', text: 'my name is Jane Doe' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'the name of the street' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-LK-001',
    positive: () => {
      const record = make({ id: 'x', text: 'key AKIAIOSFODNN7EXAMPLE here' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'nothing sensitive here' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-LK-002',
    positive: () => {
      const record = make({ id: 'x', text: 'password = "hunter2hunter2"' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'password = "your_api_key_here"' });
      return context(record, [record]);
    }
  },
  {
    id: 'PD-LK-003',
    positive: () => {
      const record = make({ id: 'x', text: 'hello', source: '/Users/jane/data.json' });
      return context(record, [record]);
    },
    negative: () => {
      const record = make({ id: 'x', text: 'hello', source: 'data/examples.jsonl' });
      return context(record, [record]);
    }
  }
];

test('the catalogue contains every rule listed in the specification', () => {
  // The specification's rule table lists 18 ids; its prose says "19 rules".
  assert.equal(RULES.length, 18);
  assert.equal(ruleCatalogue().length, 18);
  assert.deepEqual(
    RULES.map((rule) => rule.id),
    [
      'PD-DUP-001',
      'PD-DUP-002',
      'PD-CON-001',
      'PD-CON-002',
      'PD-CON-003',
      'PD-BAL-001',
      'PD-BAL-002',
      'PD-FMT-001',
      'PD-FMT-002',
      'PD-FMT-003',
      'PD-FMT-004',
      'PD-PRV-001',
      'PD-PRV-002',
      'PD-PRV-003',
      'PD-PRV-004',
      'PD-LK-001',
      'PD-LK-002',
      'PD-LK-003'
    ]
  );
});

test('every rule declares a complete definition', () => {
  for (const rule of RULES) {
    assert.match(rule.id, /^PD-[A-Z]{2,3}-\d{3}$/);
    assert.ok(['quality', 'balance', 'format', 'privacy', 'leakage'].includes(rule.category));
    assert.ok(['critical', 'high', 'medium', 'low', 'info'].includes(rule.severity));
    assert.ok(rule.description.length > 0);
    assert.ok(rule.remediation.length > 0);
    assert.equal(typeof rule.test, 'function');
  }
});

test('getRule finds a rule by id and returns undefined otherwise', () => {
  assert.equal(getRule('PD-DUP-001').id, 'PD-DUP-001');
  assert.equal(getRule('PD-NOPE-999'), undefined);
});

test('the catalogue is JSON serialisable', () => {
  const catalogue = ruleCatalogue();
  assert.deepEqual(JSON.parse(JSON.stringify(catalogue)), catalogue);
});

for (const entry of CASES) {
  test(`${entry.id} detects its defect`, () => {
    const rule = getRule(entry.id);
    assert.ok(rule, `rule ${entry.id} exists`);
    assert.ok(rule.test('sample text', entry.positive()));
  });

  test(`${entry.id} stays quiet on clean data`, () => {
    const rule = getRule(entry.id);
    assert.ok(rule, `rule ${entry.id} exists`);
    assert.equal(rule.test('sample text', entry.negative()), false);
  });
}
