// Defines the normalised record shape shared by the loader, the scanner and the repairer.

const KINDS = ['example', 'pair', 'profile'];

const REQUIRED_BY_KIND = {
  example: ['messages'],
  pair: ['prompt', 'chosen', 'rejected'],
  profile: ['text']
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function detectKind(input) {
  if (!isPlainObject(input)) return 'profile';
  if (Array.isArray(input.messages)) return 'example';
  if ('chosen' in input && 'rejected' in input) return 'pair';
  return 'profile';
}

function normaliseMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => isPlainObject(message))
    .map((message) => ({
      role: toText(message.role),
      content: toText(message.content)
    }));
}

function normaliseRecord(input, context = {}) {
  const source = isPlainObject(input) ? input : {};
  const kind = detectKind(source);
  const path = typeof context.path === 'string' ? context.path : '';
  const index = Number.isFinite(context.index) ? context.index : 0;

  const known = new Set([
    'id',
    'kind',
    'messages',
    'prompt',
    'chosen',
    'rejected',
    'text',
    'label',
    'source',
    'metadata'
  ]);
  const extras = {};
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key)) extras[key] = value;
  }
  const metadata = { ...extras, ...(isPlainObject(source.metadata) ? source.metadata : {}) };

  const id = typeof source.id === 'string' && source.id.trim() ? source.id : `${path}#${index}`;

  return {
    id,
    kind,
    messages: normaliseMessages(source.messages),
    prompt: toText(source.prompt),
    chosen: toText(source.chosen),
    rejected: toText(source.rejected),
    text: toText(source.text),
    label: toText(source.label),
    source: toText(source.source),
    metadata,
    path,
    index
  };
}

function validateRecord(record) {
  const problems = [];
  if (!isPlainObject(record)) {
    return [{ field: 'record', problem: 'missing required field' }];
  }
  const kind = KINDS.includes(record.kind) ? record.kind : 'profile';
  const required = REQUIRED_BY_KIND[kind];

  for (const field of required) {
    if (field === 'messages') {
      if (!Array.isArray(record.messages) || record.messages.length === 0) {
        problems.push({ field, problem: 'missing required field' });
      }
      continue;
    }
    const value = record[field];
    if (typeof value !== 'string' || !value.trim()) {
      problems.push({ field, problem: 'missing required field' });
    }
  }
  return problems;
}

// Concatenates every content-bearing field so rules can inspect a record as text.
// Empty fields are skipped: they would otherwise add phantom characters to the
// length budget check and leave blank lines at the head of every excerpt.
function contentText(record) {
  if (!isPlainObject(record)) return '';
  const parts = [];
  const push = (value) => {
    const text = toText(value);
    if (text) parts.push(text);
  };
  if (Array.isArray(record.messages)) {
    for (const message of record.messages) {
      if (isPlainObject(message)) push(message.content);
    }
  }
  for (const field of ['prompt', 'chosen', 'rejected', 'text']) {
    push(record[field]);
  }
  return parts.join('\n');
}

module.exports = {
  KINDS,
  REQUIRED_BY_KIND,
  normaliseRecord,
  validateRecord,
  contentText,
  detectKind
};
