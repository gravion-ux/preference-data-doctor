// Tests for the scanner: rules are applied to single records and to whole datasets.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normaliseRecord } = require('../src/schema');
const { scanRecord, scanDataset, locate } = require('../src/scanner');

function make(input, index = 0, file = 'data.json') {
  return normaliseRecord(input, { path: file, index });
}

function ruleIds(findings) {
  return findings.map((finding) => finding.ruleId);
}

test('scanRecord reports the problems of a single record', () => {
  const record = make({ id: 'x', text: 'write to jane@example.com' });
  const findings = scanRecord(record, { records: [record], stats: {} });
  assert.ok(ruleIds(findings).includes('PD-PRV-001'));
});

test('scanRecord returns an empty list for a clean record', () => {
  const record = make({ id: 'x', text: 'a perfectly ordinary sample' });
  assert.deepEqual(scanRecord(record, { records: [record], stats: {} }), []);
});

test('scanDataset detects exact duplicates', () => {
  const records = [make({ id: 'a', text: 'same sample' }, 0), make({ id: 'b', text: 'same sample' }, 1)];
  const findings = scanDataset(records, {});
  const duplicates = findings.filter((finding) => finding.ruleId === 'PD-DUP-001');
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].recordId, 'b');
  assert.equal(duplicates[0].index, 1);
});

test('scanDataset detects contradictory preference pairs', () => {
  const records = [make({ id: 'p', prompt: 'q?', chosen: 'same', rejected: 'same' }, 0)];
  const findings = scanDataset(records, {});
  assert.ok(ruleIds(findings).includes('PD-CON-001'));
});

test('scanDataset detects class imbalance', () => {
  const records = [];
  for (let i = 0; i < 10; i += 1) {
    records.push(make({ id: `a-${i}`, text: `sample ${i}`, label: 'a' }, i));
  }
  records.push(make({ id: 'b-0', text: 'rare sample', label: 'b' }, 10));
  const findings = scanDataset(records, {});
  assert.ok(ruleIds(findings).includes('PD-BAL-001'));
  assert.ok(ruleIds(findings).includes('PD-BAL-002'));
});

test('scanDataset honours the character budget', () => {
  const records = [make({ id: 'x', text: 'a'.repeat(100) }, 0)];
  const findings = scanDataset(records, { maxChars: 10 });
  assert.ok(ruleIds(findings).includes('PD-FMT-003'));
});

test('scanDataset sorts findings by severity', () => {
  const records = [make({ id: 'x', text: 'mail jane@example.com and key AKIAIOSFODNN7EXAMPLE' }, 0)];
  const findings = scanDataset(records, {});
  const severities = findings.map((finding) => finding.severity);
  assert.ok(severities.indexOf('critical') < severities.indexOf('high'));
});

test('every excerpt is redacted before it is stored', () => {
  const records = [make({ id: 'x', text: 'token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, 0)];
  const findings = scanDataset(records, {});
  const leaked = findings.filter((finding) => finding.excerpt.includes('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.equal(leaked.length, 0);
});

test('the character budget only trips above the limit', () => {
  const atLimit = [make({ id: 'x', text: 'a'.repeat(100) }, 0)];
  assert.equal(ruleIds(scanDataset(atLimit, { maxChars: 100 })).includes('PD-FMT-003'), false);
  const overLimit = [make({ id: 'x', text: 'a'.repeat(101) }, 0)];
  assert.ok(ruleIds(scanDataset(overLimit, { maxChars: 100 })).includes('PD-FMT-003'));
});

test('a duplicate excerpt is the record content without padding', () => {
  const records = [make({ id: 'a', text: 'same sample' }, 0), make({ id: 'b', text: 'same sample' }, 1)];
  const findings = scanDataset(records, {});
  const duplicate = findings.find((finding) => finding.ruleId === 'PD-DUP-001');
  assert.equal(duplicate.excerpt, 'same sample');
});

test('locate reports the line and column of an offset', () => {
  const text = 'first line\nsecond line';
  const position = locate(text, text.indexOf('second'));
  assert.equal(position.line, 2);
  assert.equal(position.column, 1);
  assert.ok(position.excerpt.includes('second'));
});

test('locate handles an empty text', () => {
  const position = locate('', 0);
  assert.equal(position.line, 1);
  assert.equal(position.column, 1);
  assert.equal(position.excerpt, '');
});
