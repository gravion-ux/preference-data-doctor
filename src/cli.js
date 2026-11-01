#!/usr/bin/env node
// Command line entry point: argument parsing, report output and exit codes.

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const { loadDatasetDetailed } = require('./loader');
const { scanDataset } = require('./scanner');
const { summarize, severityRank, SEVERITIES } = require('./findings');
const { toJson, toMarkdown } = require('./report');
const { ruleCatalogue } = require('./rules');
const { repairDataset } = require('./repair');

const ERROR_PREFIX = 'preference-doctor: error: ';
const DEFAULT_MAX_CHARS = 8000;

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

function usageText() {
  return [
    'preference-doctor — diagnose and repair preference datasets',
    '',
    'Usage:',
    '  preference-doctor audit <path> [--json <out.json>] [--md <out.md>] [--fail-on <severity>] [--max-chars <n>] [--quiet]',
    '  preference-doctor repair <path> --out <file.json> [--json <out.json>] [--md <out.md>] [--quiet]',
    '  preference-doctor rules [--json]',
    '',
    'Exit codes:',
    '  0  no findings at or above the threshold (default: high)',
    '  1  findings at or above the threshold',
    '  2  usage error',
    '  3  target missing or not a directory',
    ''
  ].join('\n');
}

function takeValue(args, name) {
  if (!args.length) throw usageError(`${name} requires a value`);
  const value = args.shift();
  if (value.startsWith('-')) throw usageError(`${name} requires a value`);
  return value;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const options = {
    command: '',
    target: '',
    json: null,
    md: null,
    out: null,
    failOn: 'high',
    maxChars: DEFAULT_MAX_CHARS,
    quiet: false,
    jsonToStdout: false,
    help: false,
    version: false
  };

  if (!args.length) throw usageError('a command is required (audit, repair or rules)');
  options.command = args.shift();

  if (options.command === '--help' || options.command === '-h') {
    options.help = true;
    return options;
  }
  if (options.command === '--version' || options.command === '-v') {
    options.version = true;
    return options;
  }
  if (!['audit', 'repair', 'rules'].includes(options.command)) {
    throw usageError(`unknown command "${options.command}"`);
  }

  const isRules = options.command === 'rules';
  while (args.length) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--json') {
      if (isRules) {
        options.jsonToStdout = true;
      } else {
        options.json = takeValue(args, '--json');
      }
    } else if (arg === '--md') {
      options.md = takeValue(args, '--md');
    } else if (arg === '--out') {
      options.out = takeValue(args, '--out');
    } else if (arg === '--fail-on') {
      options.failOn = takeValue(args, '--fail-on');
    } else if (arg === '--max-chars') {
      options.maxChars = takeValue(args, '--max-chars');
    } else if (arg.startsWith('-') && arg.length > 1) {
      throw usageError(`unknown option "${arg}"`);
    } else if (options.target) {
      throw usageError(`unexpected argument "${arg}"`);
    } else {
      options.target = arg;
    }
  }

  if (options.help || options.version) return options;

  if (!isRules && !options.target) {
    throw usageError(`"${options.command}" requires a target path`);
  }
  if (options.command === 'repair' && !options.out) {
    throw usageError('"repair" requires --out <file.json>');
  }
  if (!SEVERITIES.includes(String(options.failOn).toLowerCase())) {
    throw usageError(`--fail-on must be one of: ${SEVERITIES.join(', ')}`);
  }
  options.failOn = String(options.failOn).toLowerCase();

  const maxChars = Number(options.maxChars);
  if (!Number.isFinite(maxChars) || !Number.isInteger(maxChars) || maxChars <= 0) {
    throw usageError('--max-chars must be a positive integer');
  }
  options.maxChars = maxChars;

  return options;
}

function thresholdFindings(findings, threshold) {
  const limit = severityRank(threshold);
  return (findings || []).filter((finding) => severityRank(finding.severity) >= limit);
}

function severityCounts(summary) {
  return SEVERITIES.map((severity) => `${severity} ${summary.bySeverity[severity] || 0}`).join(', ');
}

function renderFindingLines(findings) {
  return findings.map(
    (finding) => `  - ${finding.ruleId}  ${finding.path}:${finding.index}  ${finding.severity}  ${finding.message}`
  );
}

function renderSummary(command, target, stats, findings, summary) {
  const lines = [];
  lines.push(`Preference Data Doctor — ${command}`);
  lines.push(`Target: ${target}`);
  lines.push(
    `Records: ${stats.recordsLoaded} (files read: ${stats.filesRead}, malformed rows: ${stats.malformedRows}, skipped files: ${stats.skippedFiles})`
  );
  lines.push(`Findings: ${summary.total} finding(s) [${severityCounts(summary)}]`);
  lines.push(`Health score: ${summary.score} (${summary.grade} — ${summary.gradeLabel})`);
  if (findings.length) {
    lines.push('Details:');
    lines.push(...renderFindingLines(findings));
  }
  return `${lines.join('\n')}\n`;
}

function commandAudit(options) {
  const { records, stats } = loadDatasetDetailed(options.target);
  const findings = scanDataset(records, { maxChars: options.maxChars });
  const summary = summarize(findings);
  const meta = { target: options.target, generatedAt: new Date().toISOString() };

  if (options.json) {
    fs.writeFileSync(options.json, toJson(findings, summary, meta), 'utf8');
  }
  if (options.md) {
    fs.writeFileSync(options.md, toMarkdown(findings, summary, meta), 'utf8');
  }
  if (!options.quiet) {
    process.stdout.write(renderSummary('audit', options.target, stats, findings, summary));
  }
  return thresholdFindings(findings, options.failOn).length ? 1 : 0;
}

function commandRepair(options) {
  const { records, stats } = loadDatasetDetailed(options.target);
  const result = repairDataset(records);
  fs.writeFileSync(options.out, `${JSON.stringify(result.records, null, 2)}\n`, 'utf8');

  const findings = scanDataset(result.records, { maxChars: options.maxChars });
  const summary = summarize(findings);
  const meta = { target: options.out, generatedAt: new Date().toISOString() };

  if (options.json) {
    fs.writeFileSync(options.json, toJson(findings, summary, meta), 'utf8');
  }
  if (options.md) {
    fs.writeFileSync(options.md, toMarkdown(findings, summary, meta), 'utf8');
  }
  if (!options.quiet) {
    const changed = result.applied.reduce((total, entry) => total + entry.count, 0);
    const lines = [];
    lines.push('Preference Data Doctor — repair');
    lines.push(`Target: ${options.target}`);
    lines.push(`Repaired copy: ${options.out}`);
    lines.push(`Applied ${result.applied.length} repair(s) affecting ${changed} record(s).`);
    lines.push(`Removed ${result.removed.length} record(s).`);
    for (const entry of result.applied) {
      lines.push(`  - ${entry.repair}: ${entry.count} record(s)`);
    }
    lines.push(`Records: ${stats.recordsLoaded} loaded, ${result.records.length} kept`);
    lines.push(`Findings: ${summary.total} finding(s) [${severityCounts(summary)}]`);
    lines.push(`Health score: ${summary.score} (${summary.grade} — ${summary.gradeLabel})`);
    if (findings.length) {
      lines.push('Details:');
      lines.push(...renderFindingLines(findings));
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  return thresholdFindings(findings, options.failOn).length ? 1 : 0;
}

function commandRules(options) {
  const catalogue = ruleCatalogue();
  if (options.jsonToStdout) {
    process.stdout.write(`${JSON.stringify(catalogue, null, 2)}\n`);
    return 0;
  }
  const lines = ['Preference Data Doctor — rule catalogue', ''];
  for (const rule of catalogue) {
    lines.push(`${rule.id}  [${rule.severity}/${rule.category}]  ${rule.description}`);
    lines.push(`  remediation: ${rule.remediation}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${ERROR_PREFIX}${error.message}\n`);
    return 2;
  }

  try {
    if (options.help) {
      process.stdout.write(usageText());
      return 0;
    }
    if (options.version) {
      process.stdout.write(`${require('../package.json').version}\n`);
      return 0;
    }
    if (options.command === 'rules') return commandRules(options);
    if (options.command === 'audit') return commandAudit(options);
    if (options.command === 'repair') return commandRepair(options);
    process.stderr.write(`${ERROR_PREFIX}unknown command "${options.command}"\n`);
    return 2;
  } catch (error) {
    const code = error && (error.code === 'TARGET_NOT_FOUND' || error.code === 'ENOTDIR') ? 3 : 2;
    process.stderr.write(`${ERROR_PREFIX}${error.message}\n`);
    return code;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, parseArgs, usageText, thresholdFindings };
