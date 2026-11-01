// Tests for the normalised record contract.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { KINDS, REQUIRED_BY_KIND, normaliseRecord, validateRecord } = require('../src/schema');

test('schema exports the three record kinds', () => {
  assert.deepEqual(KINDS, ['example', 'pair', 'profile']);
});

test('schema exports the required fields per kind', () => {
  assert.deepEqual(REQUIRED_BY_KIND, {
    example: ['messages'],
    pair: ['prompt', 'chosen', 'rejected'],
    profile: ['text']
  });
});

test('a messages array makes an example record', () => {
  const record = normaliseRecord({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(record.kind, 'example');
});

test('chosen and rejected make a pair record', () => {
  const record = normaliseRecord({ prompt: 'p', chosen: 'c', rejected: 'r' });
  assert.equal(record.kind, 'pair');
});

test('anything else is a profile record', () => {
  const record = normaliseRecord({ text: 'hello' });
  assert.equal(record.kind, 'profile');
});

test('normalisation fills every field with its default', () => {
  const record = normaliseRecord({}, { path: 'data/x.json', index: 3 });
  assert.deepEqual(record, {
    id: 'data/x.json#3',
    kind: 'profile',
    messages: [],
    prompt: '',
    chosen: '',
    rejected: '',
    text: '',
    label: '',
    source: '',
    metadata: {},
    path: 'data/x.json',
    index: 3
  });
});

test('the id falls back to path and index', () => {
  const record = normaliseRecord({ text: 'hello' }, { path: 'data/a.jsonl', index: 7 });
  assert.equal(record.id, 'data/a.jsonl#7');
});

test('an explicit id is kept', () => {
  const record = normaliseRecord({ id: 'ex-0001', text: 'hello' }, { path: 'a.json', index: 0 });
  assert.equal(record.id, 'ex-0001');
});

test('normalisation never throws on unusable input', () => {
  for (const input of [null, undefined, 42, 'text', []]) {
    const record = normaliseRecord(input, { path: 'a.json', index: 0 });
    assert.equal(record.kind, 'profile');
    assert.equal(record.text, '');
  }
});

test('messages are normalised to role and content pairs', () => {
  const record = normaliseRecord({
    messages: [{ role: 'user', content: 'hi', extra: true }, 'nope', null]
  });
  assert.deepEqual(record.messages, [{ role: 'user', content: 'hi' }]);
});

test('unknown fields are preserved in metadata', () => {
  const record = normaliseRecord({ text: 'hello', tenant: 'acme' });
  assert.deepEqual(record.metadata, { tenant: 'acme' });
});

test('validation reports a missing messages field for examples', () => {
  const record = normaliseRecord({ id: 'e', messages: [] });
  assert.deepEqual(validateRecord(record), [{ field: 'messages', problem: 'missing required field' }]);
});

test('validation reports every missing field of a pair', () => {
  const record = normaliseRecord({ prompt: 'p', chosen: '', rejected: '' });
  const problems = validateRecord(record);
  assert.deepEqual(
    problems.map((problem) => problem.field).sort(),
    ['chosen', 'rejected']
  );
});

test('validation accepts a complete profile record', () => {
  const record = normaliseRecord({ text: 'hello' });
  assert.deepEqual(validateRecord(record), []);
});

test('validation treats whitespace as a missing value', () => {
  const record = normaliseRecord({ text: '   ' });
  assert.deepEqual(validateRecord(record), [{ field: 'text', problem: 'missing required field' }]);
});
