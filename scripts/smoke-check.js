#!/usr/bin/env node
// End-to-end smoke check: audits a temporary dataset and then repairs a copy of it.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'src', 'cli.js');

const DIRTY_ROWS = [
  '{"id":"ex-1","text":"a duplicated sample"}',
  '{"id":"ex-2","text":"a duplicated sample"}',
  '{"id":"pair-1","prompt":"Do you like apples?","chosen":"I love apples","rejected":"I love apples"}',
  '{"id":"prv-1","text":"write to jane@example.com"}',
  '{"id":"lk-1","text":"deploy token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
  '{"id":"lk-2","text":"postinstall: NPM_SECRET=hunter2hunter2"}'
].join('\n');

const CLEAN_ROWS = '{"id":"clean-1","text":"a perfectly ordinary sample"}\n';

const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`ok   ${label}`);
    return;
  }
  failures.push(label);
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preference-doctor-smoke-'));
  try {
    const dirty = path.join(root, 'dirty');
    const clean = path.join(root, 'clean');
    fs.mkdirSync(dirty);
    fs.mkdirSync(clean);
    fs.writeFileSync(path.join(dirty, 'dirty.jsonl'), DIRTY_ROWS, 'utf8');
    fs.writeFileSync(path.join(clean, 'clean.jsonl'), CLEAN_ROWS, 'utf8');

    const reportJson = path.join(root, 'report.json');
    const reportMd = path.join(root, 'report.md');
    const audit = run(['audit', dirty, '--json', reportJson, '--md', reportMd]);
    check('audit of the dirty dataset exits 1', audit.status === 1, `exit ${audit.status}`);
    check('audit lists finding(s)', audit.stdout.includes('finding(s)'));

    const report = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
    const ruleIds = report.findings.map((finding) => finding.ruleId);
    for (const ruleId of ['PD-DUP-001', 'PD-CON-001', 'PD-PRV-001', 'PD-LK-001', 'PD-LK-002']) {
      check(`report contains ${ruleId}`, ruleIds.includes(ruleId));
    }

    const rawReport = `${fs.readFileSync(reportJson, 'utf8')}\n${fs.readFileSync(reportMd, 'utf8')}`;
    check('reports hide the raw token', !rawReport.includes('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
    check('reports hide the raw email', !rawReport.includes('jane@example.com'));
    check('reports hide the raw secret value', !rawReport.includes('hunter2hunter2'));

    const cleanAudit = run(['audit', clean]);
    check('audit of the clean dataset exits 0', cleanAudit.status === 0, `exit ${cleanAudit.status}`);

    const repairedPath = path.join(root, 'repaired.json');
    const repair = run(['repair', dirty, '--out', repairedPath]);
    check('repair writes a repaired copy', fs.existsSync(repairedPath));

    const repairedRaw = fs.readFileSync(repairedPath, 'utf8');
    const repaired = JSON.parse(repairedRaw);
    check('repair removed the duplicate', !repaired.some((record) => record.id === 'ex-2'));
    check('repair kept five records', repaired.length === 5, `${repaired.length} records`);
    check('repair masked the email', !repairedRaw.includes('jane@example.com'));
    check('repair reports the remaining findings', repair.stdout.includes('PD-CON-001'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\n${failures.length} smoke check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log('\nAll smoke checks passed.');
}

main();
