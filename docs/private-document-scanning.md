# Private supporting-document scanning

This release enables supporting evidence only for native residential applications
on properties explicitly tagged as managed by ProInspect. Existing external
application links, landlord display suppression and the open-inspection disclaimer
are unchanged. Sign In / Sign Up is outside this change.

## Data handling

- The existing platform Worker, D1 database and restricted R2 bucket remain the
  application system. No new hosted database, storage bucket or public file URL.
- A separate private Worker connects to a ClamAV container. The engine has no D1
  or R2 binding, public Worker address, preview URL or application metadata.
  The platform passes bytes, an opaque document ID, digest and random nonce.
- PDF, JPEG, PNG and WebP only; 8 MiB per file, ten per applicant. Both file magic
  and MIME are checked. The multipart request is bounded even without a valid
  Content-Length. Upload requests are rate limited; simultaneous requests cannot
  exceed the document count at the database boundary.
- The engine uses INSTREAM scanning with ClamAV temporary files restricted to a
  checked private tmpfs RAM directory and removed after processing. Its HTTP
  adapter runs as the unprivileged clamav user. No request-body or filename logs.
  Internet access is denied except official ClamAV definition downloads through a
  fixed-host, fixed-path intercept. Definitions older than 72 hours fail closed.
  The supported engine minimum is ClamAV 1.5.4; the base image is digest pinned.
- Scan results are ECDSA signed. Only the isolated engine holds the private key;
  the platform holds the public key. Verification binds the exact bytes, nonce,
  document, engine source, base image, fresh definitions and complete result.
  HTTP success alone, stale/forged/incomplete results and errors cannot release a
  file. The existing legacy HMAC adapter remains separately gated.
- Clean files can accompany submission for restricted staff review. A clean scan
  never invents a human reviewer. Staff cannot download draft, pending, unsafe,
  failed or rejected files. Submitted security-cleared files can be downloaded as
  no-store, nosniff attachments for separately audited staff review. External
  application forwarding remains disabled for this managed intake.
- Current document-free applications retain their original notice and upload
  restrictions. New document applications use privacy notice v2. Both retain the
  14-day draft, 90-day submitted and 30-day withdrawn operational limits and
  existing legal/privacy holds. Erasure removes R2 objects, scan jobs and scan
  receipts. These periods are operator choices, not universal legal requirements.

## Release state and prerequisites

The two private Worker identities have been reserved with separate signing keys
generated directly in Cloudflare; public and preview addresses are disabled.
Their current bootstrap returns 503 and cannot scan or accept applicant data.
Only public verification keys are committed in config/private-scanner-public-keys.json.
Cloudflare currently rejects Containers with code 1000 because Workers Paid is
required. No production upload release is recorded by this code or migration.

Workers Paid must be available in the existing account before deploying the real
engine. The selected engine uses standard-1 (4 GiB, 0.5 vCPU), one instance per
environment and a 60-second idle shutdown. Charges depend on actual usage. No
public malware-analysis provider is used.

## Controlled deployment

1. Require successful protected CI, including the Docker test against the actual
   pinned ClamAV engine (clean fixture, harmless EICAR fixture and failure cases).
   The integration tests use synthetic transport responses and are explicitly
   separate from this actual engine check and live release proof.
2. Use the existing shared staging environment with all normal operational flags
   off. Capture recovery bookmarks and counts before applying additive 0057 to
   existing staging D1. Rehearse schema/data preservation and recovery locally.
   Do not edit or reapply 0055/0056 and do not provision another D1 database.
3. Build/deploy ONLY the separate staging engine using:
   `PRIVATE_SCANNER_DEPLOY=1 node scripts/deploy/private-scanner.mjs staging`.
   The runner needs Docker and an authorised Cloudflare connection. It fixes the
   target name, disables public/preview addresses and pins SCANNER_SOURCE_SHA to
   the exact checkout. The existing signing secret is retained. The production
   engine uses the same command with `production`, after staging validation.
4. Collect fresh live health, clean and EICAR results through the temporary
   authenticated scripts/release/private-scanner-probe.ts helper. It has only a
   scanner service binding and a random one-use release token, accepts no uploaded
   files, and must be deleted immediately after the probe. Verify the engine has
   no public/preview URLs, public routes or document/database bindings.
5. Prepare a disabled source-bound intake record using Node 22:
   `node --experimental-strip-types scripts/release/private-document-release.mjs
   production PLATFORM_SHA SCANNER_SHA public-key.json live-proof.json record.json`.
   The tool checks the registered verification key, signatures, freshness, source,
   base image and positive EICAR detection. Synthetic protocol-test keys cannot
   authorise a hosted release. The output includes no private signing key.
6. Preserve the existing main upload-only Cloudflare build command. Merge only
   after the required checks pass; obtain final main CI evidence and upload an
   inactive platform version. Keep all existing resource bindings and secrets.
   The only added platform resource is the private scanner service binding.
7. Capture a fresh production D1 recovery bookmark, schema hash, key record counts
   and Worker version/deployment metadata. Apply 0057 and its ledger entry in one
   atomic D1 batch on the existing production database. Its empty configuration
   table and additional count guard do not activate uploads. Verify every prior
   schema object and key count, ledger and foreign-key integrity before proceeding.
8. Verify the LIVE production engine, insert the disabled record, and enable only
   that exact main-source record with a guarded update after confirming the
   live-proof hash and existing management tags. This is the owner's requested
   release; do not represent it as independent review. The previous live Worker
   continues to use its document-free record while the new version is at 0%.
9. Preflight new0%/old100% using the existing version override header. Verify the
   two managed properties, privacy v2, applicant/staff access boundaries, no public
   R2 access, unchanged resources and fresh private-engine evidence. Promote only
   after these checks, retaining the previous version at 0% for rollback.
   Avoid synthetic applications, applicant documents or test emails in production.

## Recovery and maintenance

Disable the exact scanned-document release to stop new uploads. Maintain a
source-matching legacy details-only record if details-only intake should remain
available on that version. Alternatively restore the recorded previous Worker
deployment. Retain additive tables and all real applications/documents; a Worker
rollback is not permission to restore or delete production D1 data. A recovery
must respect erasure receipts and privacy holds.

Scanner failures leave files restricted. After retry exhaustion, applicants can
remove and replace the file, or continue without optional attachments after
removing pending evidence. Alert operators on sustained scanner failures or stale
definitions using redacted operational codes. Patch the pinned image through the
same real-engine and signed live acceptance sequence. Rotate a signing key only
with a new immutable source-bound release and matching registered public key.

Sources: [Cloudflare Containers](https://developers.cloudflare.com/containers/),
[pricing](https://developers.cloudflare.com/containers/platform/pricing/),
[ClamAV Docker](https://docs.clamav.net/manual/Installing/Docker.html),
[scanning](https://docs.clamav.net/manual/Usage/Scanning.html) and
[FreshClam](https://docs.clamav.net/manual/Usage/SignatureManagement.html). Current plan restriction is a provider response,
not an independent-review or release-approval requirement.

### Scanner CI startup diagnostics
The real-engine CI container uses FreshClam's standard DNS-assisted signature updates (official updater, pinned engine); the private hosted runtime keeps its existing fixed-host HTTP-only download boundary. The initial refresh runs before clamd using a temporary configuration without the notification directive; periodic refresh starts after the socket is ready. CI exposes only signature-update diagnostics, never applicant content. The diagnostic step inspects the running engine instead of starting a second clamd and competing for its log/socket. A failed download does not override the 72-hour freshness gate: acceptance must still demonstrate the actual engine, fresh loaded signatures, clean and EICAR verdicts, digest mismatch and size rejection, and dropped privileges.

The `Verify ProInspect` workflow runs disposable local regression tests independently of the real antivirus acceptance job. The authoritative `verify` job still requires both results to be `success`; missing, skipped, cancelled or failed real-engine acceptance blocks verification. This allows all application diagnostics to be collected during a definition-provider outage without relaxing any security prerequisite or authorising deployment.
