// Applies the safe repairs: dedupe, redact, trim, and an explicit rebalance report.

const { redact } = require('./redact');
const { exactContentKey, labelDistribution } = require('./rules');

const TEXT_FIELDS = ['prompt', 'chosen', 'rejected', 'text', 'label', 'source'];
const CONTENT_FIELDS = ['prompt', 'chosen', 'rejected', 'text'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(record) {
  const copy = { ...record };
  if (Array.isArray(record.messages)) {
    copy.messages = record.messages.map((message) => (isPlainObject(message) ? { ...message } : message));
  }
  if (isPlainObject(record.metadata)) copy.metadata = { ...record.metadata };
  return copy;
}

function trimRecord(record) {
  let changed = false;
  for (const field of TEXT_FIELDS) {
    if (typeof record[field] !== 'string') continue;
    const trimmed = record[field].trim();
    if (trimmed !== record[field]) {
      record[field] = trimmed;
      changed = true;
    }
  }
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) {
      if (!isPlainObject(message) || typeof message.content !== 'string') continue;
      const trimmed = message.content.trim();
      if (trimmed !== message.content) {
        message.content = trimmed;
        changed = true;
      }
    }
  }
  return changed;
}

function redactRecord(record) {
  let changed = false;
  for (const field of CONTENT_FIELDS) {
    if (typeof record[field] !== 'string' || !record[field]) continue;
    const redacted = redact(record[field]);
    if (redacted !== record[field]) {
      record[field] = redacted;
      changed = true;
    }
  }
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) {
      if (!isPlainObject(message) || typeof message.content !== 'string' || !message.content) continue;
      const redacted = redact(message.content);
      if (redacted !== message.content) {
        message.content = redacted;
        changed = true;
      }
    }
  }
  return changed;
}

function repairDataset(records, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const useDedupe = settings.dedupe !== false;
  const useRedact = settings.redactPii !== false;
  const useTrim = settings.trim !== false;

  const applied = [];
  const removed = [];
  let working = (Array.isArray(records) ? records : []).map(cloneRecord);

  if (useDedupe) {
    const seen = new Set();
    const kept = [];
    const removedIds = [];
    for (const record of working) {
      const key = exactContentKey(record);
      if (key.trim() && seen.has(key)) {
        removedIds.push(record.id);
        removed.push(record.id);
        continue;
      }
      if (key.trim()) seen.add(key);
      kept.push(record);
    }
    if (removedIds.length) {
      applied.push({ repair: 'dedupe', recordIds: removedIds, count: removedIds.length });
    }
    working = kept;
  }

  if (useRedact) {
    const changedIds = [];
    for (const record of working) {
      if (redactRecord(record)) changedIds.push(record.id);
    }
    if (changedIds.length) {
      applied.push({ repair: 'redact-pii', recordIds: changedIds, count: changedIds.length });
    }
  }

  if (useTrim) {
    const changedIds = [];
    for (const record of working) {
      if (trimRecord(record)) changedIds.push(record.id);
    }
    if (changedIds.length) {
      applied.push({ repair: 'trim', recordIds: changedIds, count: changedIds.length });
    }
  }

  // Relabelling data changes its meaning, so imbalance is reported but never edited.
  // The thresholds mirror PD-BAL-001 and PD-BAL-002 so the repair and the scanner agree.
  const { counts, total } = labelDistribution(working);
  if (total > 0) {
    let lowest = Infinity;
    let highest = 0;
    for (const count of counts.values()) {
      if (count < lowest) lowest = count;
      if (count > highest) highest = count;
    }
    const minorityIsRare = counts.size > 1 && lowest / total < 0.1;
    const dominantIsOverrepresented = highest / total > 0.9;
    if (minorityIsRare || dominantIsOverrepresented) {
      applied.push({ repair: 'rebalance', recordIds: [], count: 0 });
    }
  }

  return { records: working, applied, removed };
}

module.exports = { repairDataset };
