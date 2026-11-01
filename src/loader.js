// Discovers dataset files and turns them into normalised records.

const fs = require('node:fs');
const path = require('node:path');

const { normaliseRecord } = require('./schema');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor'];
const DATA_EXTENSIONS = ['.json', '.jsonl', '.csv'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function parseJsonDataset(text, relativePath) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { records: [], malformed: 1 };
  }

  let list;
  if (Array.isArray(data)) {
    list = data;
  } else if (isPlainObject(data) && Array.isArray(data.data)) {
    list = data.data;
  } else if (isPlainObject(data)) {
    list = [data];
  } else {
    return { records: [], malformed: 1 };
  }

  const records = [];
  let malformed = 0;
  for (const item of list) {
    if (!isPlainObject(item)) {
      malformed += 1;
      continue;
    }
    records.push(normaliseRecord(item, { path: relativePath, index: records.length }));
  }
  return { records, malformed };
}

function parseJsonlDataset(text, relativePath) {
  const records = [];
  let malformed = 0;
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (!isPlainObject(item)) {
      malformed += 1;
      continue;
    }
    records.push(normaliseRecord(item, { path: relativePath, index: records.length }));
  }
  return { records, malformed };
}

// Minimal RFC4180-style reader: quoted fields may contain commas and escaped quotes.
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsvDataset(text, relativePath) {
  const rows = parseCsvRows(String(text));
  if (!rows.length) return { records: [], malformed: 0 };

  const header = rows[0].map((column) => String(column).trim());
  const lowered = header.map((column) => column.toLowerCase());
  const textIndex = ['text', 'prompt', 'content']
    .map((name) => lowered.indexOf(name))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  const labelIndex = lowered.indexOf('label');

  const records = [];
  let malformed = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.length === 1 && cells[0].trim() === '') continue;
    if (cells.length !== header.length) {
      malformed += 1;
      continue;
    }

    const raw = { metadata: {} };
    for (let column = 0; column < header.length; column += 1) {
      const name = header[column];
      const value = cells[column];
      if (column === textIndex) {
        raw.text = value;
      } else if (column === labelIndex) {
        raw.label = value;
      } else {
        raw.metadata[name] = value;
      }
    }
    records.push(normaliseRecord(raw, { path: relativePath, index: records.length }));
  }
  return { records, malformed };
}

function parseDatasetFile(text, relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === '.jsonl') return parseJsonlDataset(text, relativePath);
  if (extension === '.csv') return parseCsvDataset(text, relativePath);
  return parseJsonDataset(text, relativePath);
}

function collectFiles(dir, root, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      collectFiles(absolute, root, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!DATA_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
    files.push({ absolute, relative: toPosix(path.relative(root, absolute)) });
  }
}

function loadDatasetDetailed(targetPath, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const maxFileSize = Number.isFinite(Number(settings.maxFileSize))
    ? Number(settings.maxFileSize)
    : MAX_FILE_BYTES;
  const maxFiles = Number.isFinite(Number(settings.maxFiles)) ? Number(settings.maxFiles) : 2000;
  const sort = settings.sort !== false;

  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    const error = new Error('A target path is required.');
    error.code = 'TARGET_NOT_FOUND';
    throw error;
  }

  const resolved = path.resolve(targetPath);
  let stats;
  try {
    stats = fs.statSync(resolved);
  } catch {
    const error = new Error(`Target not found: ${targetPath}`);
    error.code = 'TARGET_NOT_FOUND';
    throw error;
  }
  if (!stats.isDirectory()) {
    const error = new Error(`Target is not a directory: ${targetPath}`);
    error.code = 'ENOTDIR';
    throw error;
  }

  const found = [];
  collectFiles(resolved, resolved, found);
  if (sort) {
    found.sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));
  }

  const summary = {
    target: targetPath,
    filesRead: 0,
    recordsLoaded: 0,
    malformedRows: 0,
    skippedFiles: 0
  };

  const records = [];
  const limited = found.slice(0, Math.max(0, maxFiles));
  summary.skippedFiles += found.length - limited.length;

  for (const file of limited) {
    let size = 0;
    try {
      size = fs.statSync(file.absolute).size;
    } catch {
      summary.skippedFiles += 1;
      continue;
    }
    if (size > maxFileSize) {
      summary.skippedFiles += 1;
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(file.absolute, 'utf8');
    } catch {
      summary.skippedFiles += 1;
      continue;
    }
    const parsed = parseDatasetFile(text, file.relative);
    records.push(...parsed.records);
    summary.malformedRows += parsed.malformed;
    summary.filesRead += 1;
  }

  if (sort) {
    records.sort((a, b) => {
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      return a.index - b.index;
    });
  }

  summary.recordsLoaded = records.length;
  return { records, stats: summary };
}

function loadDataset(targetPath, options = {}) {
  return loadDatasetDetailed(targetPath, options).records;
}

module.exports = {
  loadDataset,
  loadDatasetDetailed,
  parseJsonDataset,
  parseJsonlDataset,
  parseCsvDataset,
  MAX_FILE_BYTES,
  SKIP_DIRS
};
