# ProInspect Rebuild deployment bootstrap

This is a temporary, non-operational holding Worker, not an application release. The real application source remains in apps/platform and apps/marketing.

Cloudflare Worker: proinspect-rebuild. Only the GitHub branch proinspect-rebuild is intended to deploy it. No production domains, credentials, database, documents, event queues, or service bindings are used. The account returned D1 error 7406 (10 databases per account); never substitute a production or existing staging database. Dedicated rebuild buckets and queues have been provisioned but are not bound to this holding Worker.

Before switching to the platform build, provision a fresh proinspect-rebuild-data D1 database, apply and verify the existing migrations against that database only, create a separately guarded rebuild configuration, bind only rebuild resources and set independent secrets and access policy. Disable real external notifications, payments, scheduled jobs and calendar writes pending sandbox acceptance. Keep the production and V3 deployment paths unchanged. Test the actual application before designating this environment ready. Remove the temporary bootstrap when the isolated application deployment is established.
