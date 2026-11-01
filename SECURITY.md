# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through the repository's GitHub Security Advisories
page (Repository → Security → Report a vulnerability). Include the affected version, the
dataset shape that triggered the problem, and the output you observed.

Please do not open a public issue for a vulnerability until it has been acknowledged.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |
| < 0.1.0 | no |

## How secrets and personal data are handled

- **Evidence is redacted before it is stored.** Every excerpt that reaches a finding, a JSON
  report or a Markdown report passes through `redact()` first.
- **Private key blocks** are replaced with `[REDACTED PRIVATE KEY]`.
- **Access keys and tokens** (AWS access key ids, GitHub tokens, Slack tokens, `sk-` keys)
  keep only a short prefix and suffix hint.
- **Credential assignments** keep the key name; the value is masked.
- **Email addresses** keep the domain and a masked local part.
- **Phone numbers, card-like numbers and personal name patterns** are masked.
- **Placeholder values** such as `your_api_key_here`, `xxxxxx`, `<token>` and `changeme` are
  recognised and never reported as secrets.
- The tool never writes a full secret or a full personal identifier to stdout, to a report
  file, or to a repaired dataset.
- Repaired datasets are written to a new file; the source dataset is never modified.

Findings still reveal *where* a problem is (file, record id, index). Treat reports as
sensitive documents and store them accordingly.
