# Upstream reporting code synchronisation

The upstream project is `info-rbp/ProInspect-Report-Creation-App`. The integrated portable source lives in
`packages/report-engine/upstream/`, pinned by `packages/report-engine/upstream-lock.json`.
The source application still owns its editor/infra code; Firestore, Firebase Authentication, GCP and Appwrite are not mirrored.

Run **GitHub Actions → Propose upstream reporting update → Run workflow** and select
`integration/report-creation-tool`. Optionally supply a full reviewed upstream SHA.
The action opens a pull request against the integration branch, never `main`, and never merges or deploys.
If upstream changed the file structure, the transformation intentionally fails until reviewed.

GitHub schedules only run from the default branch; therefore **continuous unattended updates are not active**
while the workflow exists only on this non-default branch. An upstream `repository_dispatch` event
is supported but needs a sender with appropriate repository permissions. Do not configure automatic
production merges. Any report engine update must be reviewed against cross-portal authorisation, D1/R2
constraints, PDF snapshots, tenancy forms and the no-regression suite.

After native reporting acceptance, consider publishing versioned portable packages upstream. This script
is a source-update bridge with explicit input allowlisting and adapter versioning, not a second backend.
