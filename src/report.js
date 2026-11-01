// Renders the diagnostic report as stable JSON and as Markdown.

const { SEVERITIES, CATEGORIES, sortFindings, summarize } = require('./findings');
const { redact } = require('./redact');

const TOOL_NAME = 'preference-data-doctor';
const SCHEMA_VERSION = 1;

function escapeCell(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

// summarize() exposes flat per-category totals; the breakdown table needs one row per
// category split by severity, so it is derived from the findings themselves.
function categoryBreakdown(findings) {
  const table = {};
  for (const category of CATEGORIES) {
    table[category] = {};
    for (const severity of SEVERITIES) table[category][severity] = 0;
  }
  for (const finding of findings) {
    const category = String((finding && finding.category) || '');
    const severity = String((finding && finding.severity) || '');
    if (!table[category]) table[category] = {};
    if (!(severity in table[category])) table[category][severity] = 0;
    table[category][severity] += 1;
  }
  return table;
}

function orderFindings(findings) {
  // Reports sort by severity, then path, then index.
  return sortFindings(findings).sort((a, b) => {
    const pathA = String(a.path || '');
    const pathB = String(b.path || '');
    if (pathA !== pathB) return pathA < pathB ? -1 : 1;
    const indexA = Number(a.index) || 0;
    const indexB = Number(b.index) || 0;
    if (indexA !== indexB) return indexA - indexB;
    return 0;
  });
}

function toJson(findings, summary, meta = {}) {
  const list = orderFindings(findings);
  const stats = summary || summarize(list);
  const details = meta && typeof meta === 'object' ? meta : {};

  return JSON.stringify(
    {
      tool: TOOL_NAME,
      schemaVersion: SCHEMA_VERSION,
      target: details.target === undefined ? null : details.target,
      generatedAt: details.generatedAt || new Date().toISOString(),
      summary: stats,
      findings: list.map((finding) => ({
        ruleId: finding.ruleId,
        category: finding.category,
        severity: finding.severity,
        recordId: finding.recordId,
        path: finding.path,
        index: finding.index,
        excerpt: redact(finding.excerpt),
        message: redact(finding.message),
        remediation: finding.remediation
      }))
    },
    null,
    2
  );
}

function toMarkdown(findings, summary, meta = {}) {
  const list = orderFindings(findings);
  const stats = summary || summarize(list);
  const details = meta && typeof meta === 'object' ? meta : {};
  const target = details.target === undefined || details.target === null ? 'unknown' : details.target;
  const generatedAt = details.generatedAt || new Date().toISOString();

  const lines = [];
  lines.push('# Preference Data Diagnostic Report');
  lines.push('');
  lines.push(`- Target: \`${target}\``);
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Health score: ${stats.score} (${stats.grade} — ${stats.gradeLabel})`);
  lines.push(`- Findings: ${stats.total}`);
  lines.push('');
  lines.push('## Severity summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  for (const severity of SEVERITIES) {
    lines.push(`| ${severity} | ${(stats.bySeverity && stats.bySeverity[severity]) || 0} |`);
  }
  lines.push(`| Total | ${stats.total} |`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!list.length) {
    lines.push('No findings.');
    lines.push('');
  } else {
    lines.push('| Severity | Rule | Record | Location | Message |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const finding of list) {
      lines.push(
        `| ${escapeCell(finding.severity)} | ${escapeCell(finding.ruleId)} | ${escapeCell(
          finding.recordId
        )} | ${escapeCell(`${finding.path}:${finding.index}`)} | ${escapeCell(
          redact(finding.message)
        )} |`
      );
    }
    lines.push('');
  }
  lines.push('## Category breakdown');
  lines.push('');
  lines.push('| Category | critical | high | medium | low | info | Count |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  const breakdown = categoryBreakdown(list);
  for (const category of CATEGORIES) {
    const row = breakdown[category] || {};
    const counts = SEVERITIES.map((severity) => (row[severity] || 0));
    const total = counts.reduce((sum, value) => sum + value, 0);
    lines.push(`| ${category} | ${counts.join(' | ')} | ${total} |`);
  }
  lines.push('');
  lines.push('## Remediation');
  lines.push('');
  if (!list.length) {
    lines.push('Nothing to remediate.');
    lines.push('');
  } else {
    const seen = new Set();
    for (const finding of list) {
      if (seen.has(finding.ruleId)) continue;
      seen.add(finding.ruleId);
      lines.push(`### ${finding.ruleId} — ${finding.severity}`);
      lines.push('');
      lines.push(finding.remediation || 'No remediation recorded for this rule.');
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = { toJson, toMarkdown };
