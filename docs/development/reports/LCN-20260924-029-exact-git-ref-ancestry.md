# LCN 2026-09-24 — LCN-029 Exact Git Ref / Ancestry Safety

## Result

**PASS — EXACT GIT REF SAFETY GREEN**

## Goal

Add exact Git primitives required by coordination/release flows while preserving explicit identity and non-force safety.

## Implementation

Implementation commit:

\`f003d526f0b160587c1be7a2d80a765a0850ceec\`

Added:

- \`git_remote_ref\`
- \`git_is_ancestor\`
- \`git_push_ref\`
- \`tests/git-exact-smoke.mjs\`

Catalog:

\`101 → 104 tools\`

## git_remote_ref

Requires:

- explicit repository path
- explicit remote
- full \`refs/...\` ref

Uses exact \`git ls-remote --refs\` matching and returns:

- found
- exact ref
- exact SHA

Missing refs return \`found=false\` and \`sha=null\` rather than an ambiguous error.

## git_is_ancestor

Both caller-provided commit-ish values are resolved through \`rev-parse --verify ...^{commit}\` to exact commit SHAs before ancestry evaluation.

Result returns:

- caller inputs
- exact ancestor SHA
- exact descendant SHA
- boolean \`is_ancestor\`

Git exit status 0/1 is interpreted as true/false. Other statuses remain errors.

## git_push_ref

First contract intentionally requires:

- explicit remote
- source = exact 40-hex commit SHA or full \`refs/...\` ref
- destination = explicit full branch ref under \`refs/heads/...\`

It does not accept:

- implicit \`HEAD\`
- short branch names as source
- wildcard refs
- tag mutation
- force push

For an existing destination branch:

1. resolve current remote SHA
2. fetch that exact destination
3. verify the fetched SHA still equals the observed remote SHA
4. verify current remote SHA is an ancestor of the explicit source SHA
5. only then push \`<source_sha>:<destination>\`
6. read the remote SHA again after push

A non-fast-forward candidate is rejected before mutation with structured \`NON_FAST_FORWARD\` evidence.

Result evidence includes:

- source SHA
- remote SHA before
- remote SHA after
- whether a new branch was created
- whether fast-forward was verified
- whether remote-after equals source
- \`force_used=false\`

## Batch read-only safety repair

During LCN-029 review, \`git_branch\` was found in the \`batch_inspect\` read-only allowlist even though the direct tool supports \`create\`, \`switch\`, and \`delete\`.

That violated the intended read-only batch contract.

Repair:

- removed \`git_branch\` from \`batch_inspect\`
- added read-only \`git_is_ancestor\`
- added a regression that attempts \`git_branch(action=create)\` inside a batch
- verifies \`TOOL_NOT_ALLOWED\`
- verifies the branch was not created

The direct \`git_branch\` tool itself remains unchanged.

## Validation

Disposable local repository + bare remote acceptance:

- exact remote ref lookup: PASS
- missing remote ref evidence: PASS
- ancestor true: PASS
- ancestor false: PASS
- exact SHA fast-forward push: PASS
- before/after remote SHA evidence: PASS
- new branch exact ref creation: PASS
- non-fast-forward rejection: PASS
- remote unchanged after rejected non-fast-forward: PASS
- short ref rejection: PASS
- ambiguous/non-exact push source rejection: PASS
- tag destination rejection: PASS
- batch git_branch mutation regression: PASS

Local:

- \`npm run check\`: PASS
- full \`npm test\`: PASS
- source smoke: \`PASS tools=104\`
- dependency audit: \`0 vulnerabilities\`

GitHub Actions:

- run: \`35965366927\`
- result: **PASS**
- Windows runtime smoke tests: **PASS**
- dependency audit: **PASS**

## Architecture

The exact Git tools expose deterministic identity and mutation evidence. They do not decide release policy or choose refs on behalf of the AI.

No force option, branch switching, tag rewrite, or wildcard destructive ref surface was added.

## Follow-up

LCN-030 GitHub Actions / Release Integration is next.
