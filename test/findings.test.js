// Tests for finding construction, ordering and scoring.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEVERITIES,
  SEVERITY_WEIGHTS,
  severityRank,
  compareSeverity,
  createFinding,
  compareFindings,
  sortFindings,
  computeScore,
  gradeForScore,
  gradeLabel,
  summarize
} = require('../src/findings');

test('severities are ordered from critical to info', () => {
  assert.deepEqual(SEVERITIES, ['critical', 'high', 'medium', 'low', 'info']);
});

test('severity weights match the specification', () => {
  assert.deepEqual(SEVERITY_WEIGHTS, { critical: 20, high: 10, medium: 4, low: 2, info: 0 });
});

test('severityRank treats critical as more severe than info', () => {
  assert.ok(severityRank('critical') > severityRank('high'));
  assert.ok(severityRank('high') > severityRank('medium'));
  assert.ok(severityRank('medium') > severityRank('low'));
  assert.ok(severityRank('low') > severityRank('info'));
});

test('compareSeverity sorts the more severe value first', () => {
  assert.ok(compareSeverity('critical', 'low') < 0);
  assert.ok(compareSeverity('low', 'critical') > 0);
  assert.equal(compareSeverity('medium', 'medium'), 0);
});

test('createFinding defaults index and recordId', () => {
  const finding = createFinding({ ruleId: 'PD-DUP-001' });
  assert.equal(finding.index, 0);
  assert.equal(finding.recordId, 'unknown');
});

test('createFinding normalises the index to a number', () => {
  assert.equal(createFinding({ index: '4' }).index, 4);
  assert.equal(createFinding({ index: 'nope' }).index, 0);
});

test('createFinding keeps a non-empty record id', () => {
  assert.equal(createFinding({ recordId: 'ex-0001' }).recordId, 'ex-0001');
  assert.equal(createFinding({ recordId: '   ' }).recordId, 'unknown');
});

test('sortFindings orders by severity, path, index and rule id', () => {
  const findings = [
    createFinding({ ruleId: 'PD-B', severity: 'low', path: 'a.json', index: 0 }),
    createFinding({ ruleId: 'PD-A', severity: 'high', path: 'b.json', index: 2 }),
    createFinding({ ruleId: 'PD-C', severity: 'low', path: 'a.json', index: 1 }),
    createFinding({ ruleId: 'PD-A', severity: 'low', path: 'a.json', index: 1 })
  ];
  const sorted = sortFindings(findings);
  assert.deepEqual(
    sorted.map((finding) => `${finding.severity}:${finding.path}:${finding.index}:${finding.ruleId}`),
    ['high:b.json:2:PD-A', 'low:a.json:0:PD-B', 'low:a.json:1:PD-A', 'low:a.json:1:PD-C']
  );
});

test('compareFindings is a total order for equal findings', () => {
  const finding = createFinding({ ruleId: 'PD-A', severity: 'medium', path: 'a.json', index: 1 });
  assert.equal(compareFindings(finding, { ...finding }), 0);
});

test('computeScore sums the severity weights', () => {
  const findings = [
    createFinding({ severity: 'critical' }),
    createFinding({ severity: 'high' }),
    createFinding({ severity: 'medium' })
  ];
  assert.equal(computeScore(findings), 34);
});

test('computeScore is capped at 100', () => {
  const findings = Array.from({ length: 20 }, () => createFinding({ severity: 'critical' }));
  assert.equal(computeScore(findings), 100);
});

test('computeScore is deterministic', () => {
  const findings = [createFinding({ severity: 'low' }), createFinding({ severity: 'medium' })];
  assert.equal(computeScore(findings), computeScore(findings.slice().reverse()));
});

test('gradeForScore follows the grade bands', () => {
  assert.equal(gradeForScore(0), 'A+');
  assert.equal(gradeForScore(9), 'A+');
  assert.equal(gradeForScore(10), 'A');
  assert.equal(gradeForScore(19), 'A');
  assert.equal(gradeForScore(20), 'B');
  assert.equal(gradeForScore(34), 'B');
  assert.equal(gradeForScore(35), 'C');
  assert.equal(gradeForScore(49), 'C');
  assert.equal(gradeForScore(50), 'D');
  assert.equal(gradeForScore(69), 'D');
  assert.equal(gradeForScore(70), 'F');
  assert.equal(gradeForScore(100), 'F');
});

test('gradeLabel describes a grade', () => {
  assert.equal(gradeLabel('A+'), 'Excellent');
  assert.equal(gradeLabel('F'), 'Critical');
});

test('summarize counts findings by severity and category', () => {
  const findings = [
    createFinding({ ruleId: 'PD-LK-001', category: 'leakage', severity: 'critical', recordId: 'a' }),
    createFinding({ ruleId: 'PD-PRV-001', category: 'privacy', severity: 'high', recordId: 'a' }),
    createFinding({ ruleId: 'PD-DUP-001', category: 'quality', severity: 'medium', recordId: 'b' })
  ];
  const summary = summarize(findings);
  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.critical, 1);
  assert.equal(summary.bySeverity.high, 1);
  assert.equal(summary.bySeverity.medium, 1);
  assert.equal(summary.byCategory.leakage, 1);
  assert.equal(summary.byCategory.privacy, 1);
  assert.equal(summary.affectedRecords, 2);
  assert.equal(summary.score, 34);
  assert.equal(summary.grade, 'B');
  assert.equal(typeof summary.gradeLabel, 'string');
});

test('summarize handles an empty finding list', () => {
  const summary = summarize([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.score, 0);
  assert.equal(summary.grade, 'A+');
  assert.equal(summary.affectedRecords, 0);
});
