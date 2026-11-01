# Preference Data Doctor

[![CI](https://github.com/gravion-ux/preference-data-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/gravion-ux/preference-data-doctor/actions/workflows/ci.yml)

Preference Data Doctor diagnoses — and repairs — the preference datasets that personalise
LLM systems: few-shot examples, preference pairs, and user profile records.

## Why it matters

Preference datasets grow by hand, get copied between projects, and quietly rot:

- **Duplicates** waste training and inference budget.
- **Contradictory pairs** teach the model the wrong thing.
- **Class imbalance** skews the output toward the dominant label.
- **Format drift** breaks the parser downstream.
- **Personal data and secrets** leak into a dataset that gets shipped.

Preference Data Doctor reads a dataset directory, reports every defect it finds with a
redacted excerpt and a concrete remediation, scores the dataset, and can write a repaired
copy.

## Install

Node.js 18 or newer. There are no runtime or dev dependencies.

```bash
git clone https://github.com/gravion-ux/preference-data-doctor.git
cd preference-data-doctor
npm install
npm test
```

Run it without installing:

```bash
node src/cli.js audit ./data
```

## Usage

```
preference-doctor audit <path> [--json <out.json>] [--md <out.md>]
                  [--fail-on <severity>] [--max-chars <n>] [--quiet]
preference-doctor repair <path> --out <file.json> [--json <out.json>] [--md <out.md>] [--quiet]
preference-doctor rules [--json]
```

- `audit` scans every `.json`, `.jsonl` and `.csv` file below `<path>` and prints the findings.
- `repair` applies the safe repairs and writes the repaired records as a JSON array to `--out`.
- `rules` prints the diagnostic catalogue, as text or as JSON.

Exit codes: `0` no findings at or above the threshold (default `high`), `1` findings at or
above the threshold, `2` usage error, `3` target missing or not a directory.

```bash
node src/cli.js audit ./data --json report.json --md report.md
node src/cli.js repair ./data --out ./data-repaired.json
```

More detail: [docs/USAGE.md](docs/USAGE.md) and [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md).

## Rule table

| ID | Category | Severity | Detects |
| --- | --- | --- | --- |
| PD-DUP-001 | quality | medium | two records with identical normalised content (exact duplicate) |
| PD-DUP-002 | quality | low | two records whose content differs only by whitespace or case (near duplicate) |
| PD-CON-001 | quality | high | a preference pair where `chosen` and `rejected` are identical |
| PD-CON-002 | quality | high | two records with the same `id` but different content |
| PD-CON-003 | quality | medium | a preference pair whose `chosen` is shorter than its `rejected` |
| PD-BAL-001 | balance | medium | the least frequent `label` covers less than 10% of labelled records |
| PD-BAL-002 | balance | medium | one `label` covers more than 90% of labelled records |
| PD-FMT-001 | format | medium | a record missing a field its kind requires |
| PD-FMT-002 | format | low | a record whose text content is empty or whitespace only |
| PD-FMT-003 | format | medium | a record longer than `maxChars` (default 8000 characters) |
| PD-FMT-004 | format | low | a record whose `messages` array does not alternate user/assistant and start with `user` |
| PD-PRV-001 | privacy | high | record content contains an email address |
| PD-PRV-002 | privacy | high | record content contains a credit-card-like number |
| PD-PRV-003 | privacy | medium | record content contains a phone number |
| PD-PRV-004 | privacy | medium | record content contains a personal name pattern |
| PD-LK-001 | leakage | critical | record content contains a private key block, AWS access key id, GitHub token, Slack token or `sk-` key |
| PD-LK-002 | leakage | high | record content contains a credential assignment with a non-placeholder value |
| PD-LK-003 | leakage | medium | a record with `source` pointing at a private machine-local path |

## Scoring

Every finding adds its severity weight to the dataset score, capped at 100:

| Severity | Weight |
| --- | --- |
| critical | 20 |
| high | 10 |
| medium | 4 |
| low | 2 |
| info | 0 |

| Score | Grade |
| --- | --- |
| 0–9 | A+ |
| 10–19 | A |
| 20–34 | B |
| 35–49 | C |
| 50–69 | D |
| 70–100 | F |

## Library use

```js
const { createDoctor, toJson, repairDataset } = require('preference-data-doctor');

const { records, findings, summary } = createDoctor('./data');
console.log(summary.grade, summary.score);
```

## Development

```bash
npm test        # node:test suite, every test file enumerated explicitly
npm run check   # syntax check of every source file
```

## License

MIT — see [LICENSE](LICENSE).
