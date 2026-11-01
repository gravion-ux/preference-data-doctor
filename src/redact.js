// Masks secret-looking strings and personal data before any evidence is printed or written.

const PLACEHOLDERS = new Set([
  'your_api_key_here',
  'your-api-key-here',
  'your_token_here',
  'your-token-here',
  'your-key-here',
  'xxx',
  'xxxx',
  'xxxxxx',
  '<token>',
  '<your-token>',
  '<your-api-key>',
  '<api-key>',
  'changeme',
  'change-me',
  'replace_me',
  'replace-me',
  'example.com',
  'placeholder',
  'redacted',
  'none',
  'null'
]);

// Values that are obviously redacted already; re-running redact() must not touch them.
const MASK_MARKER = /[…*]/;

function isPlaceholder(value) {
  if (typeof value !== 'string') return false;
  const normalised = value.trim().toLowerCase();
  if (!normalised) return false;
  if (PLACEHOLDERS.has(normalised)) return true;
  return /^(x{3,}|\*{3,}|\.{3,}|<[^>]*>|\{\{[^}]*\}\})$/.test(normalised);
}

function maskValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!text) return '';
  if (text.length < 8) return '…';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

// Keep a prefix/suffix hint for long values; short values are masked completely.
function maskEmailLocal(local) {
  if (!local) return '…';
  if (local.length <= 4) return `${local}…`;
  if (local.length < 8) return `${local[0]}…${local[local.length - 1]}`;
  return `${local.slice(0, 4)}…${local.slice(-4)}`;
}

function maskDigits(digits) {
  if (digits.length < 4) return '…';
  return `${digits.slice(0, 2)}…${digits.slice(-2)}`;
}

const PRIVATE_KEY_RE = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;
const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/g;
const GITHUB_TOKEN_RE = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;
const SLACK_TOKEN_RE = /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g;
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const CREDENTIAL_RE =
  /((?:password|passwd|pwd|secret|api[_\-]?key|apikey|access[_\-]?key|auth[_\-]?token|access[_\-]?token|client[_\-]?secret|private[_\-]?key|token)["']?\s*[:=]\s*)(["']?)([^\s"',;]{3,})(["']?)/gi;
const CARD_RE = /(?:\d[ -]?){12,18}\d/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d(?:[\d\s().-]*\d)?/g;
const NAME_RE =
  /\b(?:my name is|my name's|my names|call me)\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)*)/g;

function maskName(name) {
  return name
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 2) return `${word[0]}…`;
      return `${word[0]}…${word[word.length - 1]}`;
    })
    .join(' ');
}

function redact(text) {
  if (text === null || text === undefined) return '';
  let value = typeof text === 'string' ? text : String(text);

  value = value.replace(
    PRIVATE_KEY_RE,
    (_match, kind) => `-----BEGIN ${kind}----- [REDACTED PRIVATE KEY] -----END ${kind}-----`
  );
  value = value.replace(AWS_KEY_RE, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);
  value = value.replace(GITHUB_TOKEN_RE, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);
  value = value.replace(SLACK_TOKEN_RE, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);
  value = value.replace(OPENAI_KEY_RE, (match) => `${match.slice(0, 3)}…${match.slice(-4)}`);
  value = value.replace(CREDENTIAL_RE, (match, prefix, openQuote, secret, closeQuote) => {
    if (MASK_MARKER.test(secret)) return match;
    if (isPlaceholder(secret)) return match;
    return `${prefix}${openQuote}${maskValue(secret)}${closeQuote}`;
  });
  value = value.replace(CARD_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return match;
    return `${digits.slice(0, 4)}…${digits.slice(-4)}`;
  });
  value = value.replace(PHONE_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 12) return match;
    return maskDigits(digits);
  });
  value = value.replace(NAME_RE, (_match, name) => {
    const label = _match.slice(0, _match.indexOf(name));
    return `${label}${maskName(name)}`;
  });
  value = value.replace(EMAIL_RE, (match) => {
    const at = match.lastIndexOf('@');
    const local = match.slice(0, at);
    const domain = match.slice(at);
    return `${maskEmailLocal(local)}${domain}`;
  });

  return value;
}

// Exposed for repairs and rules that need email-only masking.
function redactEmails(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(EMAIL_RE, (match) => {
    const at = match.lastIndexOf('@');
    return `${maskEmailLocal(match.slice(0, at))}${match.slice(at)}`;
  });
}

module.exports = {
  redact,
  redactEmails,
  maskValue,
  isPlaceholder,
  maskEmailLocal
};
