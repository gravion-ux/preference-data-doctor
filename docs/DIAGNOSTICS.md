# Diagnostics

Every diagnostic is a rule with an id, a category, a severity, a description, a remediation
and a test. The catalogue contains 18 rules.

| Category | Meaning |
| --- | --- |
| `quality` | duplicated, contradictory or mislabelled data |
| `balance` | skewed label distribution |
| `format` | shape and size problems that break parsers |
| `privacy` | personal data inside the dataset |
| `leakage` | credentials and machine-local paths |

## Findings

```js
{
  ruleId: 'PD-LK-001',
  category: 'leakage',
  severity: 'critical',
  recordId: 'lk-1',
  path: 'data/examples.jsonl',
  index: 4,
  excerpt: 'ghp_…aaaa',
  message: 'Record content contains a GitHub token.',
  remediation: 'Revoke the exposed credential and remove it from the dataset immediately.'
}
```

Findings are ordered by severity (`critical` → `info`), then path, then index, then rule id.

## Quality

### PD-DUP-001 — exact duplicate (medium)

Two records whose normalised content is identical. Whitespace runs are collapsed before
the comparison, so `"a  b"` and `"a b"` count as the same content. The later record is
reported.

### PD-DUP-002 — near duplicate (low)

Two records whose content differs only by case or whitespace (`"Hello world"` versus
`"hello world"`). The later record is reported.

### PD-CON-001 — identical pair (high)

A preference pair whose `chosen` and `rejected` answers are the same string. Such a pair
teaches the model nothing.

### PD-CON-002 — reused id (high)

Two records share an `id` but carry different content. Downstream joins and audits become
ambiguous.

### PD-CON-003 — suspicious pair length (medium)

A preference pair whose `chosen` answer is shorter than its `rejected` answer. This is
usually a swapped label.

## Balance

### PD-BAL-001 — rare label (medium)

The least frequent label covers less than 10% of the labelled records.

### PD-BAL-002 — dominant label (medium)

One label covers more than 90% of the labelled records.

Both rules are reported once per offending label, on the first record that carries it.

## Format

### PD-FMT-001 — missing required field (medium)

The record does not contain the fields its kind requires. See
[USAGE.md](USAGE.md) for the required fields per kind.

### PD-FMT-002 — empty content (low)

Every content field of the record is empty or whitespace only.

### PD-FMT-003 — oversized record (medium)

The record is longer than `--max-chars` (default 8000 characters).

### PD-FMT-004 — broken conversation (low)

A few-shot example whose `messages` array does not start with `user` and alternate
`user`/`assistant`.

## Privacy

### PD-PRV-001 — email address (high)

### PD-PRV-002 — credit-card-like number (high)

A run of 13 to 19 digits, optionally separated by spaces or dashes.

### PD-PRV-003 — phone number (medium)

### PD-PRV-004 — personal name (medium)

Patterns such as `my name is …` or `call me …`.

## Leakage

### PD-LK-001 — credential material (critical)

A private key block, an AWS access key id, a GitHub token, a Slack token or an `sk-` key.

### PD-LK-002 — credential assignment (high)

An assignment such as `password = "…"`, `api_key: …` or `token=…` whose value is not a
placeholder. The placeholder values `your_api_key_here`, `xxx`, `<your-token>`,
`changeme`, `example.com` and `REPLACE_ME` are never reported.

### PD-LK-003 — private path (medium)

The `source` field points at a machine-local path (`/Users/`, `C:\Users\`, `~/`, `/home/`),
which leaks the author's environment.

## Redaction

Evidence is masked before it is stored in a finding or written to a report:

| Input | Output |
| --- | --- |
| `AKIAIOSFODNN7EXAMPLE` | `AKIA…MPLE` |
| `ghp_…` token | `ghp_…aaaa` |
| `password = "hunter2hunter2"` | `password = "hunt…ter2"` |
| `user@example.com` | `user…@example.com` |
| private key block | `-----BEGIN RSA PRIVATE KEY----- [REDACTED PRIVATE KEY] -----END RSA PRIVATE KEY-----` |

Values shorter than eight characters are masked completely as `…`.

## Scoring

| Severity | Weight |
| --- | --- |
| critical | 20 |
| high | 10 |
| medium | 4 |
| low | 2 |
| info | 0 |

The weights are summed and capped at 100. The score becomes a grade:

| Score | Grade | Label |
| --- | --- | --- |
| 0–9 | A+ | Excellent |
| 10–19 | A | Good |
| 20–34 | B | Fair |
| 35–49 | C | Needs attention |
| 50–69 | D | Poor |
| 70–100 | F | Critical |

## Repairs

| Repair | Default | What it does |
| --- | --- | --- |
| `dedupe` | on | drops records whose normalised content duplicates an earlier record; the first one wins |
| `redact-pii` | on | masks secrets and personal data inside the content fields |
| `trim` | on | trims leading and trailing whitespace on every text field |
| `rebalance` | never applied | reports an imbalanced label distribution without changing any label |

Relabelling data changes its meaning, so `rebalance` is reported with a count of `0` and
never edits the dataset. Repaired records keep their original `id`, `path` and `index`.
