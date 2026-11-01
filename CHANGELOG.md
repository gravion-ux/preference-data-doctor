# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-31

### Added

- `audit`, `repair` and `rules` commands with JSON and Markdown reports.
- Diagnostic catalogue of 18 rules covering quality, balance, format, privacy and leakage.
- Dataset health score with A+ to F grading.
- Safe repairs: exact deduplication, redaction of secrets and personal data, whitespace trimming.
- Public JavaScript API (`loadDataset`, `scanDataset`, `summarize`, `repairDataset`, …).
