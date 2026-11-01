// Tests for the command line interface: parsing, exit codes and file outputs.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { parseArgs } = require('../src/cli');
const { RULES } = require('../src/rules');

const CLI = path.join(__dirname, '..', 'src', 'cli.js');
const tempDirs = [];

const DIRTY_JSONL = [
  '{"id":"ex-1","text":"a duplicated sample"}',
  '{"id":"ex-2","text":"a duplicated sample"}',
  '{"id":"pair-1","prompt":"Do you like apples?","chosen":"I love apples","rejected":"I love apples"}',
  '{"id":"prv-1","text":"write to jane@example.com"}',
  '{"id":"lk-1","text":"deploy token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
  '{"id":"lk-2","text":"postinstall: NPM_SECRET=hunter2hunter2"}'
].join('\n');

const CLEAN_JSONL = [
  '{"id":"clean-1","text":"a perfectly ordinary sample"}',
  '{"id":"clean-2","text":"another ordinary sample"}'
].join('\n');

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-cli-'));
  tempDirs.push(dir);
  return dir;
}

function write(dir, name, contents) {
  const target = path.join(dir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  return target;
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseArgs reads the audit options', () => {
  const options = parseArgs(['audit', 'data', '--json', 'out.json', '--md', 'out.md', '--fail-on', 'low']);
  assert.equal(options.command, 'audit');
  assert.equal(options.target, 'data');
  assert.equal(options.json, 'out.json');
  assert.equal(options.md, 'out.md');
  assert.equal(options.failOn, 'low');
});

test('parseArgs reads the repair options', () => {
  const options = parseArgs(['repair', 'data', '--out', 'fixed.json', '--quiet']);
  assert.equal(options.command, 'repair');
  assert.equal(options.out, 'fixed.json');
  assert.equal(options.quiet, true);
});

test('parseArgs treats --json as a flag for the rules command', () => {
  const options = parseArgs(['rules', '--json']);
  assert.equal(options.jsonToStdout, true);
  assert.equal(options.json, null);
});

test('parseArgs rejects an unknown command', () => {
  assert.throws(() => parseArgs(['nope']));
});

test('parseArgs rejects an unknown severity', () => {
  assert.throws(() => parseArgs(['audit', 'data', '--fail-on', 'urgent']));
});

test('an unknown command exits with a usage error', () => {
  const result = run(['nope']);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.startsWith('preference-doctor: error: '));
});

test('audit without a path exits with a usage error', () => {
  const result = run(['audit']);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.startsWith('preference-doctor: error: '));
});

test('a missing target exits with code 3', () => {
  const result = run(['audit', path.join(os.tmpdir(), 'pdd-missing-target-98765')]);
  assert.equal(result.status, 3);
});

test('audit of a dirty dataset exits with code 1 and lists the findings', () => {
  const dir = makeTempDir();
  write(dir, 'dirty.jsonl', DIRTY_JSONL);
  const result = run(['audit', dir]);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes('finding(s)'));
  for (const ruleId of ['PD-DUP-001', 'PD-CON-001', 'PD-PRV-001', 'PD-LK-001', 'PD-LK-002']) {
    assert.ok(result.stdout.includes(ruleId), `summary mentions ${ruleId}`);
  }
});

test('audit of a clean dataset exits with code 0', () => {
  const dir = makeTempDir();
  write(dir, 'clean.jsonl', CLEAN_JSONL);
  const result = run(['audit', dir]);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('0 finding(s)'));
});

test('audit writes the JSON and Markdown reports', () => {
  const dir = makeTempDir();
  write(dir, 'dirty.jsonl', DIRTY_JSONL);
  const jsonPath = path.join(dir, 'report.json');
  const mdPath = path.join(dir, 'report.md');
  const result = run(['audit', dir, '--json', jsonPath, '--md', mdPath]);
  assert.equal(result.status, 1);
  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(report.tool, 'preference-data-doctor');
  assert.ok(report.findings.length > 0);
  const markdown = fs.readFileSync(mdPath, 'utf8');
  assert.ok(markdown.includes('# Preference Data Diagnostic Report'));
  assert.ok(markdown.includes('| Severity | Count |'));
});

test('audit keeps secrets out of the written report', () => {
  const dir = makeTempDir();
  write(dir, 'dirty.jsonl', DIRTY_JSONL);
  const jsonPath = path.join(dir, 'report.json');
  run(['audit', dir, '--json', jsonPath]);
  const report = fs.readFileSync(jsonPath, 'utf8');
  assert.ok(!report.includes('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  assert.ok(!report.includes('hunter2hunter2'));
  assert.ok(!report.includes('jane@example.com'));
});

test('quiet suppresses the human summary', () => {
  const dir = makeTempDir();
  write(dir, 'dirty.jsonl', DIRTY_JSONL);
  const result = run(['audit', dir, '--quiet']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});

test('repair without --out is a usage error', () => {
  const dir = makeTempDir();
  write(dir, 'clean.jsonl', CLEAN_JSONL);
  const result = run(['repair', dir]);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.startsWith('preference-doctor: error: '));
});

test('repair writes a repaired copy without duplicates and masked emails', () => {
  const dir = makeTempDir();
  write(dir, 'dirty.jsonl', DIRTY_JSONL);
  const outPath = path.join(dir, 'repaired.json');
  const result = run(['repair', dir, '--out', outPath]);
  assert.ok(result.stdout.includes('repair(s)'));
  assert.ok(result.stdout.includes('record(s)'));
  const repaired = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.ok(Array.isArray(repaired));
  assert.equal(repaired.length, DIRTY_JSONL.split('\n').length - 1);
  assert.ok(!fs.readFileSync(outPath, 'utf8').includes('jane@example.com'));
});

test('rules prints every rule id', () => {
  const result = run(['rules']);
  assert.equal(result.status, 0);
  for (const rule of RULES) {
    assert.ok(result.stdout.includes(rule.id), `rules output mentions ${rule.id}`);
  }
});

test('rules --json prints a JSON array', () => {
  const result = run(['rules', '--json']);
  assert.equal(result.status, 0);
  const catalogue = JSON.parse(result.stdout);
  assert.ok(Array.isArray(catalogue));
  assert.equal(catalogue.length, RULES.length);
  assert.equal(catalogue[0].id, 'PD-DUP-001');
});
