// Tests for the JSON and Markdown renderers.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createFinding, summarize } = require('../src/findings');
const { toJson, toMarkdown } = require('../src/report');

const FINDINGS = [
  createFinding({
    ruleId: 'PD-LK-001',
    category: 'leakage',
    severity: 'critical',
    recordId: 'ex-1',
    path: 'data/a.jsonl',
    index: 0,
    excerpt: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    message: 'Record content contains a GitHub token.',
    remediation: 'Revoke the exposed credential.'
  }),
  createFinding({
    ruleId: 'PD-DUP-001',
    category: 'quality',
    severity: 'medium',
    recordId: 'ex-2',
    path: 'data/a.jsonl',
    index: 3,
    excerpt: 'same sample',
    message: 'Exact duplicate of ex-1.',
    remediation: 'Delete the later copy.'
  })
];

test('the JSON report has the documented root keys in order', () => {
  const parsed = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), { target: 'data' }));
  assert.deepEqual(Object.keys(parsed), [
    'tool',
    'schemaVersion',
    'target',
    'generatedAt',
    'summary',
    'findings'
  ]);
  assert.equal(parsed.tool, 'preference-data-doctor');
  assert.equal(parsed.target, 'data');
});

test('the JSON report serialises finding keys in order', () => {
  const parsed = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), {}));
  assert.deepEqual(Object.keys(parsed.findings[0]), [
    'ruleId',
    'category',
    'severity',
    'recordId',
    'path',
    'index',
    'excerpt',
    'message',
    'remediation'
  ]);
});

test('the JSON report is pretty printed with two spaces', () => {
  const output = toJson(FINDINGS, summarize(FINDINGS), { generatedAt: '2026-01-01T00:00:00.000Z' });
  assert.ok(output.includes('\n  "tool": "preference-data-doctor"'));
  assert.ok(output.includes('"generatedAt": "2026-01-01T00:00:00.000Z"'));
});

test('the JSON report redacts excerpts', () => {
  const parsed = JSON.parse(toJson(FINDINGS, summarize(FINDINGS), {}));
  assert.ok(!parsed.findings[0].excerpt.includes('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
});

test('the Markdown report contains the documented sections', () => {
  const output = toMarkdown(FINDINGS, summarize(FINDINGS), { target: 'data' });
  assert.ok(output.startsWith('# Preference Data Diagnostic Report'));
  assert.ok(output.includes('- Target: `data`'));
  assert.ok(output.includes('## Severity summary'));
  assert.ok(output.includes('| Severity | Count |'));
  assert.ok(output.includes('## Findings'));
  assert.ok(output.includes('| Severity | Rule | Record | Location | Message |'));
  assert.ok(output.includes('## Category breakdown'));
  assert.ok(output.includes('| Category | critical | high | medium | low | info | Count |'));
  assert.ok(output.includes('## Remediation'));
  assert.ok(output.includes('### PD-LK-001 — critical'));
  assert.ok(output.includes('Revoke the exposed credential.'));
});

test('the Markdown report sorts findings by severity', () => {
  const output = toMarkdown(FINDINGS, summarize(FINDINGS), {});
  const criticalAt = output.indexOf('PD-LK-001');
  const duplicateAt = output.indexOf('PD-DUP-001');
  assert.ok(criticalAt < duplicateAt);
});

test('the Markdown category breakdown counts findings per severity', () => {
  const output = toMarkdown(FINDINGS, summarize(FINDINGS), {});
  assert.ok(output.includes('| quality | 0 | 0 | 1 | 0 | 0 | 1 |'));
  assert.ok(output.includes('| leakage | 1 | 0 | 0 | 0 | 0 | 1 |'));
  assert.ok(output.includes('| privacy | 0 | 0 | 0 | 0 | 0 | 0 |'));
});

test('an empty report says so explicitly', () => {
  const output = toMarkdown([], summarize([]), {});
  assert.ok(output.includes('No findings.'));
  assert.ok(output.includes('Nothing to remediate.'));
});
