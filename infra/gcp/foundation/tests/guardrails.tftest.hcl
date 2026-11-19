mock_provider "google" {}
variables {
  image = "australia-southeast1-docker.pkg.dev/proinspect-property-services/proinspect-migration-dev/platform@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

  billing_account = "synthetic-billing-account"
}
run "isolated_capacity_and_access" {
  command = plan
  assert {
    condition     = alltrue([for s in google_cloud_run_v2_service.proof : s.scaling[0].max_instance_count == 1 && s.scaling[0].min_instance_count == 0 && !s.invoker_iam_disabled])
    error_message = "Proof must retain IAM checks and scale from zero to at most one configured instance."
  }
  assert {
    condition     = length(google_storage_bucket.documents) == 4 && alltrue([for b in google_storage_bucket.documents : b.public_access_prevention == "enforced" && b.uniform_bucket_level_access && !b.force_destroy])
    error_message = "Each environment requires separate private standard/restricted buckets."
  }
  assert {
    condition     = length(google_cloud_scheduler_job.proof) == 4 && alltrue([for j in google_cloud_scheduler_job.proof : j.paused])
    error_message = "Every schedule must remain paused."
  }
  assert {
    condition     = alltrue([for q in google_cloud_tasks_queue.events : q.rate_limits[0].max_concurrent_dispatches == 1 && q.retry_config[0].max_attempts == 3])
    error_message = "Task concurrency and retry bounds must be retained."
  }
  assert {
    condition     = google_billing_budget.foundation.amount[0].specified_amount[0].currency_code == "AUD"
    error_message = "Budget currency must match the verified billing account."
  }
}
run "postgres_is_opt_in" {
  command = plan
  assert {
    condition     = length(google_sql_database_instance.postgres) == 0 && length(google_compute_network.postgres) == 0
    error_message = "Default deployment must create no SQL instance or private network."
  }
}
run "approved_dev_database" {
  command = plan
  variables {
    sql_environments  = ["dev"]
    sql_allowance_aud = 20
    migration_image   = "australia-southeast1-docker.pkg.dev/proinspect-property-services/proinspect-migration-dev/platform@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition     = alltrue([for db in google_sql_database_instance.postgres : db.settings[0].tier == "db-f1-micro" && db.settings[0].disk_autoresize_limit == 20 && !db.settings[0].ip_configuration[0].ipv4_enabled && db.deletion_protection])
    error_message = "SQL must stay private, small, protected and disk capped."
  }
}
