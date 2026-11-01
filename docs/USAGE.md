# Usage

Preference Data Doctor reads a **directory** of dataset files and reports what is wrong
with them. Every `.json`, `.jsonl` and `.csv` file below the target is loaded; the
directories `node_modules`, `.git`, `dist`, `build` and `vendor` are skipped.

## Commands

### audit

```bash
preference-doctor audit <path> [--json <out.json>] [--md <out.md>] \
                        [--fail-on <severity>] [--max-chars <n>] [--quiet]
```

Scans the dataset, prints the findings and optionally writes reports.

| Option | Meaning |
| --- | --- |
| `--json <out.json>` | write the JSON report to a file |
| `--md <out.md>` | write the Markdown report to a file |
| `--fail-on <severity>` | severity that makes the command exit `1` (default `high`) |
| `--max-chars <n>` | character budget per record (default `8000`) |
| `--quiet` | suppress the human-readable summary |

The summary always states how many `finding(s)` were detected and lists the rule id of
every finding on its own line.

### repair

```bash
preference-doctor repair <path> --out <file.json> [--json <out.json>] [--md <out.md>] [--quiet]
```

Loads the dataset, applies the safe repairs and writes the repaired records as a JSON
array to `--out`. The source dataset is never modified. The command reports how many
repairs were applied and how many records were removed, and exits `1` when the repaired
dataset still has findings at or above the threshold.

### rules

```bash
preference-doctor rules [--json]
```

Prints the rule catalogue. With `--json` the catalogue is printed as a JSON array of
`{ id, category, severity, description, remediation }` objects.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no findings at or above the threshold |
| `1` | findings at or above the threshold |
| `2` | usage error (printed to stderr with the prefix `preference-doctor: error: `) |
| `3` | the target is missing or is not a directory |

## File formats

### JSON

A `.json` file is one object, an array of objects, or an object with a top-level array
under the key `data`.

### JSONL

One JSON object per line. Blank lines are ignored, malformed lines are skipped and
counted in `malformedRows`.

### CSV

The first row is the header. Every later row becomes a record:

- `text` is taken from the first of the `text`, `prompt` or `content` columns that exists,
- `label` is taken from the `label` column,
- all remaining columns are copied into `metadata`.

Quoted fields may contain commas; a row with the wrong number of columns is malformed and
skipped.

## Record kinds

| Kind | Shape | Required fields |
| --- | --- | --- |
| `example` | `{ "messages": [{ "role": "user", "content": "..." }] }` | `messages` |
| `pair` | `{ "prompt": "...", "chosen": "...", "rejected": "..." }` | `prompt`, `chosen`, `rejected` |
| `profile` | `{ "id": "...", "text": "...", "label": "...", "source": "..." }` | `text` |

Every loaded record is normalised to:

```js
{
  id: 'ex-0001',
  kind: 'example',
  messages: [],
  prompt: '',
  chosen: '',
  rejected: '',
  text: '',
  label: '',
  source: '',
  metadata: {},
  path: 'data/examples.jsonl',
  index: 0
}
```

## Library API

```js
const {
  createDoctor,
  loadDataset,
  scanDataset,
  summarize,
  toJson,
  toMarkdown,
  repairDataset
} = require('preference-data-doctor');

const { records, findings, summary } = createDoctor('./data');
console.log(summary.total, summary.score, summary.grade);

fs.writeFileSync('report.md', toMarkdown(findings, summary, { target: './data' }), 'utf8');

const { records: repaired, applied, removed } = repairDataset(records);
```

`loadDatasetDetailed(target, options)` additionally returns the loader statistics:
`{ target, filesRead, recordsLoaded, malformedRows, skippedFiles }`. `skippedFiles` counts
candidate dataset files that were not loaded because they exceeded `maxFileSize`
(default 2 MiB) or the `maxFiles` limit (default 2000).
