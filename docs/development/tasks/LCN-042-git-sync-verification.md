# LCN-042 — Git Sync Verification

Status: **COMPLETE — LIVE VALIDATED**

## Goal

Reduce repeated Git status / remote-ref / ancestry calls when verifying whether a local repository is synchronized with its exact remote branch.

The existing tools expose the required primitives independently, but a caller cannot safely chain an exact remote SHA returned by one batch operation into subsequent ancestry checks inside the same `batch_inspect` call.

## Tool

`git_sync_status`

Read-only. No fetch, pull, push, checkout, reset, or ref mutation.

## Inputs

- `repo_path`
- optional `remote`
- optional full `ref`
- optional `include_untracked`
- optional `max_status_entries`

If `remote` and `ref` are omitted, derive them from the current branch configuration:

- `branch.<name>.remote`
- `branch.<name>.merge`

Explicit remote/ref must be supplied together.

## Evidence returned

### Local identity

- repository root
- HEAD SHA
- branch
- detached / unborn
- configured upstream
- local cached ahead / behind

### Working tree

- clean
- staged / unstaged / untracked / conflicts counts
- bounded status entries

### Exact remote

Resolve the exact full remote ref through `git ls-remote --refs`:

- remote
- full ref
- found
- exact remote SHA
- exact remote matches local HEAD

### Local tracking ref

When an upstream exists:

- local tracking ref name
- local tracking SHA
- tracking SHA matches exact remote SHA

This exposes stale local remote-tracking state without mutating it.

### Exact ancestry

If the exact remote SHA object already exists in the local object database:

- exact ahead / behind counts
- local HEAD is ancestor of exact remote
- exact remote is ancestor of local HEAD

If the remote SHA has not been fetched locally, ancestry is reported as unavailable rather than guessed.

## Deterministic sync state

Possible values:

- `equal`
- `local_ahead`
- `remote_ahead`
- `diverged`
- `remote_object_not_local`
- `remote_ref_missing`
- `unborn`

Working-tree cleanliness is reported separately and does not change commit sync classification.

## Safety / correctness

- reuses existing Git command runner and validation
- exact remote lookup only; no wildcard refs
- no implicit fetch
- no mutation
- bounded status entries
- exact ancestry only when required commit objects are locally available
- explicit uncertainty when ancestry cannot be established

## Batch usage

`git_sync_status` is read-only and may be allowlisted in `batch_inspect`.

## Current evidence

- source catalog: 118 tools
- exact sync / dirty independence / local-ahead: PASS
- stale tracking + remote-only object absent: PASS
- no implicit fetch: PASS
- remote-ahead after explicit fetch: PASS
- diverged / missing ref / explicit no-upstream target: PASS
- bounded status entries: PASS
- batch visibility through disposable local remote: PASS
- source smoke: PASS (`tools=118`)
- syntax check: PASS
- dependency audit: 0 vulnerabilities
- full local suite: PASS (`PASS tools=118`, approximately 52.3 seconds)
- implementation: `1f83e23450b6c773358920dea53d6555a4f60e15`
- GitHub CI: `35996073922` — PASS
- real source-repo candidate check: PASS (`sync_state=equal`, exact ahead/behind 0/0, working tree independently dirty)
- installed source validation: PASS (`PASS tools=118`, Git sync scenario smoke PASS)
- source/install `modules/git.mjs` SHA-256 parity: PASS (`a3aaff1868762d52ba386a0b3cd7e385cc40bafd3a5344785eb90f92c521587f`)
- source↔installed `modules` tree comparison: PASS (28/28 equal; digest `c604c108645d5ac5d2065496da976bc3df3cf39b0ddc08b4a438df33d159192b`)
- pre-restart daemon: 117 tools, PID 38572, digest `b44e9a4acdf1c83e7243d5374ca1c9c4629205fc30fb305419764251ebdc416e`
- restarted runtime: PASS (118 tools, PID 19372, digest `3a4b6651ee0c2cdab802907f5a5ac7609e958579bee5a0a39c982a7ac3ae28a8`)
- live `batch_inspect → git_sync_status`: PASS
- live repo sync state: `equal`
- local HEAD = exact remote = `a087d95625a7915c286658b5cc17e9f551f5f63f`
- exact ahead/behind: 0/0
- working tree: clean

## Acceptance

- exact synced state: PASS
- dirty tree reported independently: PASS
- local-ahead state: PASS
- remote-ahead state with fetched object: PASS
- stale local tracking ref detected: PASS
- exact remote object absent locally => ancestry unavailable: PASS
- diverged state: PASS
- missing remote ref: PASS
- no-upstream + explicit remote/ref: PASS
- no-upstream without explicit remote/ref: explicit error
- bounded status entries: PASS
- no mutation / no fetch side effects: PASS
- batch visibility: PASS
- source smoke catalog: PASS
- full local suite: PASS
- dependency audit: PASS
- GitHub CI: PASS
- installed live validation: PASS
