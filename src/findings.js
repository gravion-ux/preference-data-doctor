// Builds findings, orders them by severity and turns them into a dataset health summary.

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_WEIGHTS = {
  critical: 20,
  high: 10,
  medium: 4,
  low: 2,
  info: 0
};

const CATEGORIES = ['quality', 'balance', 'format', 'privacy', 'leakage'];

const GRADE_LABELS = {
  'A+': 'Excellent',
  A: 'Good',
  B: 'Fair',
  C: 'Needs attention',
  D: 'Poor',
  F: 'Critical'
};

// Higher rank means more severe, so `critical > high > ... > info`.
function severityRank(severity) {
  const index = SEVERITIES.indexOf(String(severity || '').toLowerCase());
  if (index === -1) return 0;
  return SEVERITIES.length - index;
}

function compareSeverity(a, b) {
  return severityRank(b) - severityRank(a);
}

function createFinding(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const index = Number(source.index);
  const recordId =
    typeof source.recordId === 'string' && source.recordId.trim()
      ? source.recordId
      : typeof source.recordId === 'number' && Number.isFinite(source.recordId)
        ? String(source.recordId)
        : 'unknown';

  return {
    ruleId: typeof source.ruleId === 'string' ? source.ruleId : '',
    category: typeof source.category === 'string' ? source.category : '',
    severity: typeof source.severity === 'string' ? source.severity : 'info',
    recordId,
    path: typeof source.path === 'string' ? source.path : '',
    index: Number.isFinite(index) ? index : 0,
    excerpt: typeof source.excerpt === 'string' ? source.excerpt : '',
    message: typeof source.message === 'string' ? source.message : '',
    remediation: typeof source.remediation === 'string' ? source.remediation : ''
  };
}

function compareFindings(a, b) {
  const bySeverity = compareSeverity(a.severity, b.severity);
  if (bySeverity !== 0) return bySeverity;
  const pathA = String(a.path || '');
  const pathB = String(b.path || '');
  if (pathA !== pathB) return pathA < pathB ? -1 : 1;
  const indexA = Number(a.index) || 0;
  const indexB = Number(b.index) || 0;
  if (indexA !== indexB) return indexA - indexB;
  const ruleA = String(a.ruleId || '');
  const ruleB = String(b.ruleId || '');
  if (ruleA !== ruleB) return ruleA < ruleB ? -1 : 1;
  return 0;
}

function sortFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.slice().sort(compareFindings);
}

function computeScore(findings) {
  if (!Array.isArray(findings)) return 0;
  let score = 0;
  for (const finding of findings) {
    const weight = SEVERITY_WEIGHTS[String(finding && finding.severity)] || 0;
    score += weight;
  }
  return Math.min(100, score);
}

function gradeForScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0) return 'A+';
  if (value <= 9) return 'A+';
  if (value <= 19) return 'A';
  if (value <= 34) return 'B';
  if (value <= 49) return 'C';
  if (value <= 69) return 'D';
  return 'F';
}

function gradeLabel(grade) {
  const key = String(grade || '');
  if (GRADE_LABELS[key]) return GRADE_LABELS[key];
  const derived = gradeForScore(Number(grade));
  return GRADE_LABELS[derived];
}

function summarize(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const bySeverity = {};
  for (const severity of SEVERITIES) bySeverity[severity] = 0;
  const byCategory = {};
  for (const category of CATEGORIES) byCategory[category] = 0;

  const affected = new Set();
  for (const finding of list) {
    const severity = String(finding && finding.severity);
    if (severity in bySeverity) bySeverity[severity] += 1;
    const category = String(finding && finding.category);
    if (category in byCategory) byCategory[category] += 1;
    const recordId = finding && finding.recordId;
    if (recordId) affected.add(recordId);
  }

  const score = computeScore(list);
  const grade = gradeForScore(score);

  return {
    total: list.length,
    bySeverity,
    byCategory,
    affectedRecords: affected.size,
    score,
    grade,
    gradeLabel: gradeLabel(grade)
  };
}

module.exports = {
  SEVERITIES,
  SEVERITY_WEIGHTS,
  CATEGORIES,
  severityRank,
  compareSeverity,
  createFinding,
  compareFindings,
  sortFindings,
  computeScore,
  gradeForScore,
  gradeLabel,
  summarize
};
