// Catalogue of diagnostic rules: each rule detects one concrete defect in a preference dataset.

const { contentText, validateRecord } = require('./schema');
const { isPlaceholder } = require('./redact');

const DEFAULT_MAX_CHARS = 8000;

const PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/;
const GITHUB_TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/;
const SLACK_TOKEN_RE = /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/;
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]{16,}\b/;
const CREDENTIAL_RE =
  /((?:password|passwd|pwd|secret|api[_\-]?key|apikey|access[_\-]?key|auth[_\-]?token|access[_\-]?token|client[_\-]?secret|private[_\-]?key|token)["']?\s*[:=]\s*)(["']?)([^\s"',;]{3,})(["']?)/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const CARD_CANDIDATE_RE = /\d(?:[ -]?\d){11,19}/g;
const PHONE_CANDIDATE_RE = /\+?\d(?:[\d\s().-]*\d)?/g;
const NAME_RE =
  /\b(?:my name is|my name's|my names|call me)\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)*)/;
const PRIVATE_PATH_RE = /(?:\/Users\/|[A-Za-z]:\\Users\\|~\/|\/home\/)/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function contentParts(record) {
  const parts = [];
  if (!isPlainObject(record)) return parts;
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) {
      if (isPlainObject(message)) parts.push(`${message.role || ''}:${message.content || ''}`);
    }
  }
  for (const field of ['prompt', 'chosen', 'rejected', 'text']) {
    parts.push(typeof record[field] === 'string' ? record[field] : '');
  }
  return parts;
}

// Whitespace-insensitive but case-sensitive key: identical content means an exact duplicate.
function exactContentKey(record) {
  const body = contentParts(record).join('\n').replace(/\s+/g, ' ').trim();
  return `${(record && record.kind) || 'profile'}\u0000${body}`;
}

// Case- and whitespace-insensitive key: matches records that differ only by whitespace or case.
function nearContentKey(record) {
  return exactContentKey(record).toLowerCase().replace(/\s+/g, '');
}

function isEarlier(other, record) {
  if (!other || !record) return false;
  const otherPath = String(other.path || '');
  const recordPath = String(record.path || '');
  if (otherPath !== recordPath) return otherPath < recordPath;
  return Number(other.index) < Number(record.index);
}

function earlierRecords(record, records) {
  return (records || []).filter(
    (other) => other && other !== record && isEarlier(other, record)
  );
}

function labelDistribution(records) {
  const counts = new Map();
  let total = 0;
  for (const record of records || []) {
    if (!isPlainObject(record)) continue;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    if (!label) continue;
    total += 1;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return { counts, total };
}

function maxCharsOf(context) {
  const stats = context && context.stats ? context.stats : {};
  const candidate = stats.maxChars !== undefined ? stats.maxChars : context && context.maxChars;
  const value = Number(candidate);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_CHARS;
}

function textOf(context) {
  const record = context && context.record;
  return contentText(record);
}

const RULES = [
  {
    id: 'PD-DUP-001',
    category: 'quality',
    severity: 'medium',
    description: 'Two records carry identical normalised content (exact duplicate).',
    remediation: 'Delete the later copy and keep one record per distinct sample.',
    test(text, context) {
      const record = context && context.record;
      const key = exactContentKey(record);
      if (!key.trim()) return false;
      for (const other of earlierRecords(record, context && context.records)) {
        if (exactContentKey(other) === key) {
          return {
            message: `Exact duplicate of ${other.id} (${other.path}#${other.index}).`,
            excerpt: text,
            otherRecordId: other.id
          };
        }
      }
      return false;
    }
  },
  {
    id: 'PD-DUP-002',
    category: 'quality',
    severity: 'low',
    description: 'Two records differ only by whitespace or case (near duplicate).',
    remediation: 'Normalise whitespace and casing, then merge the near duplicate records.',
    test(text, context) {
      const record = context && context.record;
      const exact = exactContentKey(record);
      const near = nearContentKey(record);
      if (!near.trim()) return false;
      for (const other of earlierRecords(record, context && context.records)) {
        if (exactContentKey(other) === exact) continue;
        if (nearContentKey(other) === near) {
          return {
            message: `Near duplicate of ${other.id} (${other.path}#${other.index}); differs only by whitespace or case.`,
            excerpt: text,
            otherRecordId: other.id
          };
        }
      }
      return false;
    }
  },
  {
    id: 'PD-CON-001',
    category: 'quality',
    severity: 'high',
    description: 'A preference pair whose chosen and rejected answers are identical.',
    remediation: 'Re-label the pair so the preferred answer genuinely differs from the rejected one.',
    test(text, context) {
      const record = context && context.record;
      if (!record || record.kind !== 'pair') return false;
      const chosen = String(record.chosen || '').trim();
      const rejected = String(record.rejected || '').trim();
      if (!chosen || !rejected) return false;
      if (chosen !== rejected) return false;
      return { message: 'Chosen and rejected responses are identical.', excerpt: text };
    }
  },
  {
    id: 'PD-CON-002',
    category: 'quality',
    severity: 'high',
    description: 'Two records share the same id but carry different content.',
    remediation: 'Give every record a unique id, or merge the conflicting records.',
    test(text, context) {
      const record = context && context.record;
      if (!record || !record.id) return false;
      const key = exactContentKey(record);
      for (const other of earlierRecords(record, context && context.records)) {
        if (!other || other.id !== record.id) continue;
        if (exactContentKey(other) === key) continue;
        return {
          message: `Id "${record.id}" is reused by ${other.path}#${other.index} with different content.`,
          excerpt: text,
          otherRecordId: other.id
        };
      }
      return false;
    }
  },
  {
    id: 'PD-CON-003',
    category: 'quality',
    severity: 'medium',
    description: 'A preference pair whose chosen answer is shorter than its rejected answer.',
    remediation: 'Review the pair: a shorter preferred answer usually means the labels were swapped.',
    test(text, context) {
      const record = context && context.record;
      if (!record || record.kind !== 'pair') return false;
      const chosen = String(record.chosen || '').trim();
      const rejected = String(record.rejected || '').trim();
      if (!chosen || !rejected) return false;
      if (chosen.length >= rejected.length) return false;
      return {
        message: `Chosen answer is shorter (${chosen.length} chars) than rejected answer (${rejected.length} chars).`,
        excerpt: text
      };
    }
  },
  {
    id: 'PD-BAL-001',
    category: 'balance',
    severity: 'medium',
    description: 'The least frequent label covers less than 10% of the labelled records.',
    remediation: 'Collect more examples for the rare label, or downsample the dominant one.',
    test(text, context) {
      const record = context && context.record;
      if (!record) return false;
      const label = String(record.label || '').trim();
      if (!label) return false;
      const { counts, total } = labelDistribution(context && context.records);
      if (!total) return false;
      let lowest = null;
      let lowestCount = Infinity;
      for (const [name, count] of counts) {
        if (count < lowestCount) {
          lowest = name;
          lowestCount = count;
        }
      }
      if (lowest !== label) return false;
      if (lowestCount / total >= 0.1) return false;
      const first = (context.records || []).find(
        (other) => isPlainObject(other) && String(other.label || '').trim() === label
      );
      if (first && first !== record) return false;
      return {
        message: `Label "${label}" covers ${lowestCount} of ${total} labelled records (${Math.round((lowestCount / total) * 100)}%).`,
        excerpt: text
      };
    }
  },
  {
    id: 'PD-BAL-002',
    category: 'balance',
    severity: 'medium',
    description: 'A single label covers more than 90% of the labelled records.',
    remediation: 'Add records for the minority labels or rebalance the sampling of the dataset.',
    test(text, context) {
      const record = context && context.record;
      if (!record) return false;
      const label = String(record.label || '').trim();
      if (!label) return false;
      const { counts, total } = labelDistribution(context && context.records);
      if (!total) return false;
      const count = counts.get(label) || 0;
      if (count / total <= 0.9) return false;
      const first = (context.records || []).find(
        (other) => isPlainObject(other) && String(other.label || '').trim() === label
      );
      if (first && first !== record) return false;
      return {
        message: `Label "${label}" covers ${count} of ${total} labelled records (${Math.round((count / total) * 100)}%).`,
        excerpt: text
      };
    }
  },
  {
    id: 'PD-FMT-001',
    category: 'format',
    severity: 'medium',
    description: 'A record is missing a field required by its kind.',
    remediation: 'Fill in the required field so downstream parsers can consume the record.',
    test(text, context) {
      const record = context && context.record;
      if (!record) return false;
      const problems = validateRecord(record);
      if (!problems.length) return false;
      return problems.map((problem) => ({
        message: `Missing required field "${problem.field}" for a ${record.kind} record.`,
        excerpt: '',
        field: problem.field
      }));
    }
  },
  {
    id: 'PD-FMT-002',
    category: 'format',
    severity: 'low',
    description: 'A record has no content beyond whitespace.',
    remediation: 'Remove the empty record or fill it with usable content.',
    test(text, context) {
      const record = context && context.record;
      if (!record) return false;
      const content = textOf(context);
      if (content && content.trim()) return false;
      return { message: 'Record content is empty.', excerpt: '' };
    }
  },
  {
    id: 'PD-FMT-003',
    category: 'format',
    severity: 'medium',
    description: 'A record is longer than the allowed character budget.',
    remediation: 'Split or shorten the record so it stays inside the context budget.',
    test(text, context) {
      const limit = maxCharsOf(context);
      const content = textOf(context);
      if (content.length <= limit) return false;
      return {
        message: `Record is ${content.length} characters, above the ${limit} character limit.`,
        excerpt: content.slice(0, 240)
      };
    }
  },
  {
    id: 'PD-FMT-004',
    category: 'format',
    severity: 'low',
    description: 'A few-shot example whose messages do not alternate user/assistant.',
    remediation: 'Rewrite the message list so it starts with a user turn and alternates roles.',
    test(text, context) {
      const record = context && context.record;
      if (!record || record.kind !== 'example') return false;
      const messages = record.messages;
      if (!Array.isArray(messages) || messages.length === 0) return false;
      const valid = messages.every((message, position) => {
        const expected = position % 2 === 0 ? 'user' : 'assistant';
        return isPlainObject(message) && message.role === expected;
      });
      if (valid) return false;
      return {
        message: 'Messages do not start with "user" and alternate user/assistant.',
        excerpt: text
      };
    }
  },
  {
    id: 'PD-PRV-001',
    category: 'privacy',
    severity: 'high',
    description: 'Record content contains an email address.',
    remediation: 'Replace the email address with a placeholder or remove the record.',
    test(text, context) {
      const content = textOf(context);
      const match = content.match(EMAIL_RE);
      if (!match) return false;
      return { message: 'Record content contains an email address.', excerpt: match[0] };
    }
  },
  {
    id: 'PD-PRV-002',
    category: 'privacy',
    severity: 'high',
    description: 'Record content contains a credit-card-like number.',
    remediation: 'Remove or mask the card number before the dataset is shared.',
    test(text, context) {
      const content = textOf(context);
      const candidates = content.match(CARD_CANDIDATE_RE) || [];
      for (const candidate of candidates) {
        const digits = candidate.replace(/\D/g, '');
        if (digits.length >= 13 && digits.length <= 19) {
          return { message: 'Record content contains a credit-card-like number.', excerpt: candidate };
        }
      }
      return false;
    }
  },
  {
    id: 'PD-PRV-003',
    category: 'privacy',
    severity: 'medium',
    description: 'Record content contains a phone number.',
    remediation: 'Replace the phone number with a placeholder before sharing the dataset.',
    test(text, context) {
      const content = textOf(context);
      const candidates = content.match(PHONE_CANDIDATE_RE) || [];
      for (const candidate of candidates) {
        const digits = candidate.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 12) continue;
        const hasSeparator = /[\s().+-]/.test(candidate);
        if (!hasSeparator && ![9, 10, 11].includes(digits.length)) continue;
        return { message: 'Record content contains a phone number.', excerpt: candidate };
      }
      return false;
    }
  },
  {
    id: 'PD-PRV-004',
    category: 'privacy',
    severity: 'medium',
    description: 'Record content contains a personal name pattern.',
    remediation: 'Replace the personal name with an anonymised token.',
    test(text, context) {
      const content = textOf(context);
      const match = content.match(NAME_RE);
      if (!match) return false;
      return { message: 'Record content contains a personal name.', excerpt: match[0] };
    }
  },
  {
    id: 'PD-LK-001',
    category: 'leakage',
    severity: 'critical',
    description: 'Record content contains a private key, access key or API token.',
    remediation: 'Revoke the exposed credential and remove it from the dataset immediately.',
    test(text, context) {
      const content = textOf(context);
      const patterns = [
        [PRIVATE_KEY_RE, 'private key block'],
        [AWS_KEY_RE, 'AWS access key id'],
        [GITHUB_TOKEN_RE, 'GitHub token'],
        [SLACK_TOKEN_RE, 'Slack token'],
        [OPENAI_KEY_RE, 'sk- API key']
      ];
      const found = [];
      for (const [pattern, label] of patterns) {
        const match = content.match(pattern);
        if (match) {
          found.push({
            message: `Record content contains a ${label}.`,
            excerpt: match[0]
          });
        }
      }
      if (!found.length) return false;
      return found;
    }
  },
  {
    id: 'PD-LK-002',
    category: 'leakage',
    severity: 'high',
    description: 'Record content assigns a credential to a non-placeholder value.',
    remediation: 'Move the secret to environment configuration and delete it from the dataset.',
    test(text, context) {
      const content = textOf(context);
      CREDENTIAL_RE.lastIndex = 0;
      const found = [];
      let match = CREDENTIAL_RE.exec(content);
      while (match) {
        const value = match[3];
        if (!isPlaceholder(value) && !/[…*]/.test(value)) {
          found.push({
            message: 'Record content contains a credential assignment with a real value.',
            excerpt: match[0]
          });
        }
        match = CREDENTIAL_RE.exec(content);
      }
      if (!found.length) return false;
      return found;
    }
  },
  {
    id: 'PD-LK-003',
    category: 'leakage',
    severity: 'medium',
    description: 'A record source points at a machine-local private path.',
    remediation: 'Replace the source with a relative path or a neutral identifier.',
    test(text, context) {
      const record = context && context.record;
      if (!record) return false;
      const source = String(record.source || '');
      if (!source) return false;
      const match = source.match(PRIVATE_PATH_RE);
      if (!match) return false;
      return { message: `Record source exposes a local path (${match[0]}).`, excerpt: source };
    }
  }
];

const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

function ruleCatalogue() {
  return RULES.map((rule) => ({
    id: rule.id,
    category: rule.category,
    severity: rule.severity,
    description: rule.description,
    remediation: rule.remediation
  }));
}

function getRule(id) {
  return RULES_BY_ID.get(id);
}

module.exports = {
  RULES,
  ruleCatalogue,
  getRule,
  exactContentKey,
  nearContentKey,
  labelDistribution,
  DEFAULT_MAX_CHARS
};
