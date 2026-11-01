// Tests for the redaction helpers.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { redact, maskValue, isPlaceholder } = require('../src/redact');

test('redact returns an empty string for empty input', () => {
  assert.equal(redact(''), '');
  assert.equal(redact(null), '');
  assert.equal(redact(undefined), '');
});

test('redact masks a private key block', () => {
  const output = redact('-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----');
  assert.equal(
    output,
    '-----BEGIN RSA PRIVATE KEY----- [REDACTED PRIVATE KEY] -----END RSA PRIVATE KEY-----'
  );
});

test('redact masks an AWS access key id', () => {
  assert.equal(redact('AKIAIOSFODNN7EXAMPLE'), 'AKIA…MPLE');
});

test('redact masks a GitHub token', () => {
  assert.equal(redact('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'ghp_…aaaa');
});

test('redact masks a credential assignment', () => {
  assert.equal(redact('password = "hunter2hunter2"'), 'password = "hunt…ter2"');
});

test('redact masks an email address but keeps the domain', () => {
  assert.equal(redact('write to user@example.com'), 'write to user…@example.com');
});

test('redact masks a phone number', () => {
  const output = redact('call +1 555-123-4567');
  assert.ok(!output.includes('555-123-4567'));
});

test('redact masks a personal name pattern', () => {
  const output = redact('my name is John Smith');
  assert.ok(output.includes('J…n S…h'));
  assert.ok(!output.includes('John'));
});

test('redact keeps placeholder values untouched', () => {
  assert.equal(redact('password = your_api_key_here'), 'password = your_api_key_here');
  assert.equal(redact('api_key: changeme'), 'api_key: changeme');
});

test('maskValue keeps a prefix and suffix hint', () => {
  assert.equal(maskValue('abcdefghijklmnop'), 'abcd…mnop');
});

test('maskValue masks short values completely', () => {
  assert.equal(maskValue('short'), '…');
  assert.equal(maskValue(''), '');
});

test('isPlaceholder recognises placeholder values', () => {
  assert.equal(isPlaceholder('your_api_key_here'), true);
  assert.equal(isPlaceholder('xxxxxx'), true);
  assert.equal(isPlaceholder('<token>'), true);
  assert.equal(isPlaceholder('changeme'), true);
});

test('isPlaceholder rejects real secrets', () => {
  assert.equal(isPlaceholder('s3cretValue'), false);
  assert.equal(isPlaceholder(''), false);
});
