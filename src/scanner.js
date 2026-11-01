// Applies the rule catalogue to loaded records and turns matches into findings.

const { RULES, DEFAULT_MAX_CHARS } = require('./rules');
const { contentText } = require('./schema');
const { createFinding, sortFindings } = require('./findings');
const { redact } = require('./redact');

const EXCERPT_LIMIT = 240;

function locate(text, index) {
  const value = typeof text === 'string' ? text : '';
  const requested = Number(index);
  const offset = Number.isFinite(requested)
    ? Math.max(0, Math.min(value.length, Math.floor(requested)))
    : 0;
  const before = value.slice(0, offset);
  const line = before.split('\n').length;
  const lastBreak = before.lastIndexOf('\n');
  const column = offset - lastBreak;

  const start = Math.max(0, offset - 60);
  const end = Math.min(value.length, offset + 60);
  let excerpt = value.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) excerpt = `…${excerpt}`;
  if (end < value.length) excerpt = `${excerpt}…`;

  return { line, column, excerpt };
}

function snippet(text) {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= EXCERPT_LIMIT) return flat;
  return `${flat.slice(0, EXCERPT_LIMIT)}…`;
}

function scanRecord(record, context = {}) {
  const source = context && typeof context === 'object' ? context : {};
  const records = Array.isArray(source.records) ? source.records : [];
  const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
  const text = contentText(record);
  const findings = [];

  for (const rule of RULES) {
    let outcome;
    try {
      outcome = rule.test(text, { record, records, stats, maxChars: stats.maxChars });
    } catch {
      continue;
    }
    if (!outcome) continue;

    const matches = Array.isArray(outcome) ? outcome : [outcome];
    for (const entry of matches) {
      if (!entry) continue;
      const match = typeof entry === 'string' ? { message: entry } : entry;
      const excerptSource = match.excerpt !== undefined ? match.excerpt : snippet(text);
      findings.push(
        createFinding({
          ruleId: rule.id,
          category: rule.category,
          severity: match.severity || rule.severity,
          recordId: match.recordId !== undefined ? match.recordId : record && record.id,
          path: match.path !== undefined ? match.path : record && record.path,
          index: match.index !== undefined ? match.index : record && record.index,
          excerpt: redact(excerptSource),
          message: redact(match.message || rule.description),
          remediation: match.remediation || rule.remediation
        })
      );
    }
  }

  return findings;
}

function scanDataset(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const settings = options && typeof options === 'object' ? options : {};
  const maxChars = Number.isFinite(Number(settings.maxChars))
    ? Number(settings.maxChars)
    : DEFAULT_MAX_CHARS;
  const stats = { ...(settings.stats || {}), maxChars };

  const findings = [];
  for (const record of list) {
    findings.push(...scanRecord(record, { records: list, stats }));
  }
  return sortFindings(findings);
}

module.exports = { scanRecord, scanDataset, locate };
