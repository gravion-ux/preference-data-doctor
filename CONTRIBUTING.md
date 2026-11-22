# Contributing to Preference Data Doctor

Thanks for helping! Preference Data Doctor diagnoses — and repairs —
the preference datasets that personalise LLM systems: few-shot
examples, preference pairs, and user profile records. It hunts the
quiet rot those datasets accumulate: duplicates, contradictory
pairs, class imbalance and malformed records.

The most valuable contributions are new diagnostic rules, careful
repair operations, and tests.

## Ground rules

- **Repairs are explicit and reversible.** A repair must report
  exactly what it changed and must never silently drop data — a
  diagnosis the user cannot inspect is worse than no diagnosis.
- **Zero runtime dependencies — hard rule.** Node.js built-ins only.
- **Evidence with every finding.** Each finding points at the
  records that triggered it.

## Development setup

Requires Node.js 18 or newer:

```bash
git clone https://github.com/gravion-ux/preference-data-doctor.git
cd preference-data-doctor
npm install --no-audit --no-fund
npm test
```

## Running the tests

```bash
npm test        # the full suite
npm run check   # syntax-check every source file
npm run audit   # run the doctor against this repository itself
```

CI runs install, tests and checks on Node 18, 20 and 22.

## Adding a rule or repair

- Diagnostic rules live in `src/rules.js`, findings in
  `src/findings.js`, repairs in `src/repair.js`.
- A new rule needs tests in `test/rules.test.js` /
  `test/findings.test.js`: a dataset that triggers it and one that
  must not.
- A new repair needs tests in `test/repair.test.js` proving the
  repaired output is exactly the intended change — nothing more.
- If you add a source file, add it to the `check` and `test`
  scripts in `package.json` — both list files explicitly.

## Code style

- Plain Node.js, no build step; tests use the built-in `node --test`
  runner and live in `test/`.
- Comments explain *why* a threshold (duplicate similarity,
  imbalance ratio, …) is set where it is.

## Pull request workflow

1. Fork and branch from `main`: `feat/<short-name>`,
   `fix/<short-name>`, `rule/<rule-id>`, `docs/<short-name>`.
2. Run `npm run check` and the full suite locally.
3. Open the PR against `main` with: what changed, why, how you
   tested it.
4. CI must be green. One logical change per PR.
