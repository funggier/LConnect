# LCN 2026-09-24 — LCN-027 Structured Text Search

## Result

**PASS — STRUCTURED TEXT SEARCH GREEN**

## Goal

Add a bounded structured content-search primitive so common source/config/text diagnosis no longer requires raw PowerShell, ripgrep, or ad-hoc shell parsing.

## Implementation

Implementation commit:

\`0b91d8a2b1a94fa3e18a5c340ab1cd4da161591d\`

Added:

- \`search_text\`
- \`modules/structured-text-search.mjs\`
- \`modules/path-utils.mjs\`
- \`tests/structured-text-search-smoke.mjs\`

Catalog:

\`98 → 99 tools\`

The implementation uses Node.js filesystem APIs directly. No external \`rg\` dependency is required.

## Search contract

\`search_text\` supports:

- literal mode
- regular-expression mode
- case-sensitive / case-insensitive matching
- include file patterns
- exclude file patterns
- context lines
- absolute path evidence
- relative path evidence
- 1-based line number
- 1-based Unicode code-point column
- matched text
- bounded line text
- context-before/context-after evidence

UTF-8 is decoded with fatal error reporting so invalid text encoding is not silently replaced.

## Bounds

Default bounds:

- \`max_files = 500\`
- \`max_file_bytes = 2 MiB\`
- \`max_total_bytes = 10 MiB\`
- \`max_matches = 200\`
- \`max_output_chars = 60000\`
- \`max_line_chars = 1200\`
- \`max_diagnostics = 100\`

The result reports explicit truncation state for:

- files
- total bytes
- matches
- output
- diagnostics

Large files are skipped with explicit evidence rather than partially searched and silently treated as complete.

## Binary / error evidence

The tool reports bounded diagnostics for:

- binary file skipped
- file too large
- symbolic link skipped
- stat/read errors
- UTF-8 decoding errors
- directory-read errors

Binary detection uses a bounded leading sample and never treats a detected binary file as searchable text.

## Filesystem scope

The shared \`path-utils.mjs\` guard:

- enforces configured filesystem scope
- resolves existing input paths
- checks real paths in restricted mode
- prevents an explicitly supplied symlink from escaping the configured scope

Recursive text search does not traverse symbolic links.

## Batch integration

\`search_text\` is read-only and deterministic, so it was added to the existing \`batch_inspect\` read-only allowlist.

No mutation, planner, retry loop, or persistent workflow state was added.

## Validation

Targeted acceptance:

- literal search: PASS
- regex search: PASS
- Unicode/Thai search: PASS
- case-insensitive literal search: PASS
- include/exclude patterns: PASS
- context evidence: PASS
- path/line/column evidence: PASS
- binary skip/report: PASS
- large-file bound evidence: PASS
- match truncation evidence: PASS
- invalid regex error: PASS
- restricted filesystem path rejection: PASS

Local:

- \`npm run check\`: PASS
- full \`npm test\`: PASS
- source smoke: \`PASS tools=99\`
- dependency audit: \`0 vulnerabilities\`

GitHub Actions:

- run: \`35963995356\`
- result: **PASS**
- Windows job: **PASS**
- runtime smoke tests: **PASS**
- dependency audit: **PASS**

## Architecture

The tool remains a direct LConnect capability:

\`\`\`text
AI chooses query/scope/bounds
        ↓
search_text performs deterministic bounded observation
        ↓
structured evidence returns to AI
\`\`\`

No AST indexing, semantic code search, autonomous exploration, or persistent search index was introduced.

## Follow-up

LCN-028 File Integrity is now the next planned Agent Operations Reliability task.
