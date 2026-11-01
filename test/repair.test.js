// Tests for the safe repairs.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normaliseRecord } = require('../src/schema');
const { repairDataset } = require('../src/repair');

function make(input, index = 0, file = 'data.json') {
  return normaliseRecord(input, { path: file, index });
}

test('dedupe drops the later duplicate and keeps the first record', () => {
  const records = [make({ id: 'a', text: 'same sample' }, 0), make({ id: 'b', text: 'same sample' }, 1)];
  const result = repairDataset(records);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'a');
  assert.deepEqual(result.removed, ['b']);
});

test('dedupe is reported as an applied repair', () => {
  const records = [make({ id: 'a', text: 'same sample' }, 0), make({ id: 'b', text: 'same sample' }, 1)];
  const result = repairDataset(records);
  const dedupe = result.applied.find((entry) => entry.repair === 'dedupe');
  assert.ok(dedupe);
  assert.equal(dedupe.count, 1);
  assert.deepEqual(dedupe.recordIds, ['b']);
});

test('trim removes leading and trailing whitespace', () => {
  const records = [make({ id: 'a', text: '   spaced out   ' }, 0)];
  const result = repairDataset(records);
  assert.equal(result.records[0].text, 'spaced out');
  assert.ok(result.applied.some((entry) => entry.repair === 'trim'));
});

test('trim also cleans message content', () => {
  const records = [
    make({ id: 'a', messages: [{ role: 'user', content: '  hello  ' }] }, 0)
  ];
  const result = repairDataset(records);
  assert.equal(result.records[0].messages[0].content, 'hello');
});

test('redaction replaces the email address', () => {
  const records = [make({ id: 'a', text: 'write to jane@example.com' }, 0)];
  const result = repairDataset(records);
  assert.ok(!result.records[0].text.includes('jane@example.com'));
  assert.ok(result.records[0].text.includes('…@example.com'));
  assert.ok(result.applied.some((entry) => entry.repair === 'redact-pii'));
});

test('individual repairs can be switched off', () => {
  const records = [
    make({ id: 'a', text: '  jane@example.com  ' }, 0),
    make({ id: 'b', text: '  jane@example.com  ' }, 1)
  ];
  const result = repairDataset(records, { dedupe: false, redactPii: false, trim: false });
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].text, '  jane@example.com  ');
  assert.deepEqual(result.applied, []);
});

test('imbalance is reported but labels are never changed', () => {
  const records = [];
  for (let i = 0; i < 10; i += 1) {
    records.push(make({ id: `a-${i}`, text: `sample ${i}`, label: 'a' }, i));
  }
  records.push(make({ id: 'b-0', text: 'rare sample', label: 'b' }, 10));
  const result = repairDataset(records);
  const rebalance = result.applied.find((entry) => entry.repair === 'rebalance');
  assert.ok(rebalance);
  assert.equal(rebalance.count, 0);
  assert.deepEqual(
    result.records.map((record) => record.label),
    records.map((record) => record.label)
  );
});

test('a single-label dataset reports the dominant-label imbalance', () => {
  const records = [make({ id: 'a', text: 'one', label: 'only' }, 0)];
  const result = repairDataset(records);
  const rebalance = result.applied.find((entry) => entry.repair === 'rebalance');
  assert.ok(rebalance);
  assert.equal(rebalance.count, 0);
  assert.equal(result.records[0].label, 'only');
});

test('repaired records keep their original id, path and index', () => {
  const records = [make({ id: 'keep', text: '  value  ' }, 4, 'sub/data.jsonl')];
  const result = repairDataset(records);
  assert.equal(result.records[0].id, 'keep');
  assert.equal(result.records[0].path, 'sub/data.jsonl');
  assert.equal(result.records[0].index, 4);
});

test('a clean dataset needs no repairs', () => {
  const result = repairDataset([make({ id: 'a', text: 'clean' }, 0)]);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.removed, []);
  assert.equal(result.records.length, 1);
});
