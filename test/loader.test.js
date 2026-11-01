// Tests for dataset discovery and parsing.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadDataset,
  loadDatasetDetailed,
  parseJsonDataset,
  parseJsonlDataset,
  parseCsvDataset,
  MAX_FILE_BYTES,
  SKIP_DIRS
} = require('../src/loader');

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-loader-'));
  tempDirs.push(dir);
  return dir;
}

function write(dir, name, contents) {
  const target = path.join(dir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  return target;
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the size cap is two mebibytes and the skip list is fixed', () => {
  assert.equal(MAX_FILE_BYTES, 2 * 1024 * 1024);
  assert.deepEqual(SKIP_DIRS, ['node_modules', '.git', 'dist', 'build', 'vendor']);
});

test('loads a JSON array of records', () => {
  const dir = makeTempDir();
  write(dir, 'data.json', JSON.stringify([{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }]));
  const records = loadDataset(dir);
  assert.equal(records.length, 2);
  assert.equal(records[0].id, 'a');
  assert.equal(records[0].path, 'data.json');
  assert.equal(records[0].index, 0);
  assert.equal(records[1].index, 1);
});

test('loads a JSON file holding a single object', () => {
  const dir = makeTempDir();
  write(dir, 'one.json', JSON.stringify({ id: 'solo', text: 'only' }));
  const records = loadDataset(dir);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'solo');
});

test('loads a JSON file holding a data array', () => {
  const dir = makeTempDir();
  write(dir, 'wrapped.json', JSON.stringify({ data: [{ id: 'w1', text: 'x' }, { id: 'w2', text: 'y' }] }));
  const records = loadDataset(dir);
  assert.equal(records.length, 2);
  assert.equal(records[1].id, 'w2');
});

test('loads JSONL records', () => {
  const dir = makeTempDir();
  write(dir, 'lines.jsonl', '{"id":"l1","text":"one"}\n{"id":"l2","text":"two"}\n');
  const records = loadDataset(dir);
  assert.equal(records.length, 2);
  assert.equal(records[1].id, 'l2');
});

test('skips malformed JSONL lines and counts them', () => {
  const dir = makeTempDir();
  write(dir, 'lines.jsonl', '{"id":"l1","text":"one"}\nnot json\n{"id":"l2","text":"two"}\n');
  const { records, stats } = loadDatasetDetailed(dir);
  assert.equal(records.length, 2);
  assert.equal(stats.malformedRows, 1);
});

test('parses CSV rows with quoted commas', () => {
  const dir = makeTempDir();
  write(dir, 'rows.csv', 'text,label,source\n"Hello, world",positive,web\nplain,negative,web\n');
  const records = loadDataset(dir);
  assert.equal(records.length, 2);
  assert.equal(records[0].text, 'Hello, world');
  assert.equal(records[0].label, 'positive');
  assert.deepEqual(records[0].metadata, { source: 'web' });
});

test('skips CSV rows with the wrong number of columns', () => {
  const dir = makeTempDir();
  write(dir, 'rows.csv', 'text,label\nok,positive\nbroken\n');
  const { records, stats } = loadDatasetDetailed(dir);
  assert.equal(records.length, 1);
  assert.equal(stats.malformedRows, 1);
});

test('ignores files inside skipped directories', () => {
  const dir = makeTempDir();
  write(dir, 'data.json', JSON.stringify([{ id: 'kept', text: 'keep' }]));
  write(dir, path.join('node_modules', 'pkg', 'data.json'), JSON.stringify([{ id: 'dropped', text: 'drop' }]));
  const records = loadDataset(dir);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'kept');
});

test('skips files that exceed the size cap', () => {
  const dir = makeTempDir();
  write(dir, 'data.json', JSON.stringify([{ id: 'big', text: 'x'.repeat(500) }]));
  const { records, stats } = loadDatasetDetailed(dir, { maxFileSize: 20 });
  assert.equal(records.length, 0);
  assert.equal(stats.skippedFiles, 1);
  assert.equal(stats.filesRead, 0);
});

test('a missing target reports TARGET_NOT_FOUND', () => {
  assert.throws(
    () => loadDataset(path.join(os.tmpdir(), 'pdd-does-not-exist-12345')),
    (error) => error.code === 'TARGET_NOT_FOUND'
  );
});

test('a file target reports ENOTDIR', () => {
  const dir = makeTempDir();
  const file = write(dir, 'data.json', '[]');
  assert.throws(() => loadDataset(file), (error) => error.code === 'ENOTDIR');
});

test('detailed loading reports the dataset statistics', () => {
  const dir = makeTempDir();
  write(dir, 'data.json', JSON.stringify([{ id: 'a', text: 'one' }]));
  write(dir, 'more.jsonl', '{"id":"b","text":"two"}\n');
  const { records, stats } = loadDatasetDetailed(dir);
  assert.equal(records.length, 2);
  assert.equal(stats.target, dir);
  assert.equal(stats.filesRead, 2);
  assert.equal(stats.recordsLoaded, 2);
  assert.equal(stats.malformedRows, 0);
  assert.equal(stats.skippedFiles, 0);
});

test('records are sorted by path and then index', () => {
  const dir = makeTempDir();
  write(dir, 'b.json', JSON.stringify([{ id: 'b1', text: 'x' }]));
  write(dir, 'a.json', JSON.stringify([{ id: 'a1', text: 'x' }, { id: 'a2', text: 'y' }]));
  const records = loadDataset(dir);
  assert.deepEqual(
    records.map((record) => `${record.path}#${record.index}`),
    ['a.json#0', 'a.json#1', 'b.json#0']
  );
});

test('the parser helpers can be used directly', () => {
  const json = parseJsonDataset('[{"id":"j1","text":"x"}]', 'x.json');
  assert.equal(json.records.length, 1);
  assert.equal(json.malformed, 0);

  const jsonl = parseJsonlDataset('{"id":"l1","text":"x"}\nbroken\n', 'x.jsonl');
  assert.equal(jsonl.records.length, 1);
  assert.equal(jsonl.malformed, 1);

  const csv = parseCsvDataset('text,label\nhello,positive\n', 'x.csv');
  assert.equal(csv.records.length, 1);
  assert.equal(csv.records[0].label, 'positive');
});

test('a malformed JSON file is counted instead of thrown', () => {
  const parsed = parseJsonDataset('{not json', 'broken.json');
  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.malformed, 1);
});
