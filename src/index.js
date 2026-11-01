// Public API of the Preference Data Doctor.

const { loadDataset, loadDatasetDetailed } = require('./loader');
const { scanRecord, scanDataset, locate } = require('./scanner');
const { RULES, ruleCatalogue, getRule } = require('./rules');
const {
  summarize,
  computeScore,
  gradeForScore,
  sortFindings,
  createFinding,
  severityRank,
  compareSeverity,
  SEVERITIES,
  SEVERITY_WEIGHTS
} = require('./findings');
const { toJson, toMarkdown } = require('./report');
const { redact, maskValue, isPlaceholder } = require('./redact');
const { normaliseRecord, validateRecord, KINDS, REQUIRED_BY_KIND } = require('./schema');
const { repairDataset } = require('./repair');

function createDoctor(targetPath, options = {}) {
  const { records } = loadDatasetDetailed(targetPath, options);
  const findings = scanDataset(records, options);
  return { records, findings, summary: summarize(findings) };
}

module.exports = {
  loadDataset,
  loadDatasetDetailed,
  scanRecord,
  scanDataset,
  locate,
  RULES,
  ruleCatalogue,
  getRule,
  summarize,
  computeScore,
  gradeForScore,
  sortFindings,
  createFinding,
  severityRank,
  compareSeverity,
  SEVERITIES,
  SEVERITY_WEIGHTS,
  toJson,
  toMarkdown,
  redact,
  maskValue,
  isPlaceholder,
  normaliseRecord,
  validateRecord,
  KINDS,
  REQUIRED_BY_KIND,
  repairDataset,
  createDoctor
};
