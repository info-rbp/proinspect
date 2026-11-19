terraform {
  required_version = ">= 1.15, < 2.0"
  backend "gcs" {
    bucket = "proinspect-property-services-migration-tfstate"
    prefix = "foundation"
  }
  required_providers { google = { source = "hashicorp/google", version = "~> 7.0" } }
}
provider "google" { project = "proinspect-property-services" }
variable "image" {
  type        = string
  description = "Verified foundation container digest, never a mutable tag."
  validation {
    condition     = can(regex("^australia-southeast1-docker.pkg.dev/proinspect-property-services/proinspect-migration-dev/platform@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Use the exact nonproduction Artifact Registry image digest."
  }
}
variable "source_sha" {
  type = string
  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.source_sha))
    error_message = "An exact tested source SHA is required."
  }
}
variable "billing_account" { type = string }
locals {
  project        = "proinspect-property-services"
  project_number = "101236528395"
  region         = "australia-southeast1"
  environments   = toset(["dev", "staging"])
  labels         = { application = "proinspect", purpose = "migration-foundation" }
  buckets        = { for item in setproduct(local.environments, ["documents", "restricted"]) : "${item[0]}-${item[1]}" => { environment = item[0], kind = item[1] } }
  schedules      = { for item in setproduct(local.environments, ["outbox", "daily"]) : "${item[0]}-${item[1]}" => { environment = item[0], cron = item[1] == "outbox" ? "*/2 * * * *" : "0 1 * * *" } }
}
resource "google_service_account" "runtime" {
  for_each     = local.environments
  account_id   = "pi-mig-${each.key}-runtime"
  display_name = "ProInspect ${each.key} isolated proof"
}
resource "google_service_account" "invoker" {
  for_each   = local.environments
  account_id = "pi-mig-${each.key}-invoker"
}
resource "google_service_account" "deploy" {
  for_each   = local.environments
  account_id = "pi-mig-${each.key}-deploy"
}
resource "google_cloud_run_v2_service" "proof" {
  for_each             = local.environments
  name                 = "proinspect-migration-${each.key}"
  location             = local.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = false
  labels               = merge(local.labels, { environment = each.key })
  scaling {
    min_instance_count = 0
    max_instance_count = 1
  }
  template {
    service_account                  = google_service_account.runtime[each.key].email
    timeout                          = "30s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      env {
        name  = "FOUNDATION_PROOF"
        value = "true"
      }
      env {
        name  = "FOUNDATION_ENV"
        value = each.key
      }
      env {
        name  = "BUILD_SHA"
        value = var.source_sha
      }
      startup_probe {
        http_get { path = "/healthz" }
      }
      liveness_probe {
        http_get { path = "/healthz" }
      }
    }
  }
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  # CI owns the tested image and source version after initial creation.
  lifecycle { ignore_changes = [template[0].containers[0].image, template[0].containers[0].env] }
}
resource "google_storage_bucket" "documents" {
  for_each                    = local.buckets
  name                        = "${local.project}-mig-${each.key}"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = merge(local.labels, { environment = each.value.environment, classification = each.value.kind })
  versioning { enabled = true }
  lifecycle { prevent_destroy = true }
}
# Empty containers only: no copied, generated, or Terraform-managed key material.
resource "google_secret_manager_secret" "encryption" {
  for_each  = local.environments
  secret_id = "proinspect-migration-${each.key}-data-encryption-key"
  labels    = merge(local.labels, { environment = each.key })
  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
  lifecycle { prevent_destroy = true }
}
resource "google_cloud_tasks_queue" "events" {
  for_each = local.environments
  name     = "proinspect-migration-${each.key}-events"
  location = local.region
  http_target {
    http_method = "POST"
    uri_override {
      scheme                    = "HTTPS"
      host                      = trimprefix(google_cloud_run_v2_service.proof[each.key].uri, "https://")
      port                      = "443"
      uri_override_enforce_mode = "ALWAYS"
      path_override { path = "/internal/proof" }
      query_override { query_params = "" }
    }
    oidc_token {
      service_account_email = google_service_account.invoker[each.key].email
      audience              = google_cloud_run_v2_service.proof[each.key].uri
    }
  }
  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }
  retry_config {
    max_attempts       = 3
    max_retry_duration = "0s"
    min_backoff        = "10s"
    max_backoff        = "60s"
    max_doublings      = 2
  }
  stackdriver_logging_config { sampling_ratio = 0.1 }
}
resource "google_cloud_scheduler_job" "proof" {
  for_each         = local.schedules
  name             = "proinspect-migration-${each.key}"
  region           = local.region
  schedule         = each.value.cron
  time_zone        = "Etc/UTC"
  paused           = true
  attempt_deadline = "30s"
  retry_config { retry_count = 0 }
  http_target {
    uri         = "${google_cloud_run_v2_service.proof[each.value.environment].uri}/internal/proof"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.invoker[each.value.environment].email
      audience              = google_cloud_run_v2_service.proof[each.value.environment].uri
    }
  }
}
resource "google_cloud_run_v2_service_iam_member" "invoke" {
  for_each = local.environments
  location = local.region
  name     = google_cloud_run_v2_service.proof[each.key].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.invoker[each.key].email}"
}
resource "google_cloud_run_v2_service_iam_member" "ci_invoke" {
  for_each = local.environments
  location = local.region
  name     = google_cloud_run_v2_service.proof[each.key].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.deploy[each.key].email}"
}
resource "google_cloud_run_v2_service_iam_member" "deploy" {
  for_each = local.environments
  location = local.region
  name     = google_cloud_run_v2_service.proof[each.key].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deploy[each.key].email}"
}
resource "google_service_account_iam_member" "act_as" {
  for_each           = local.environments
  service_account_id = google_service_account.runtime[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy[each.key].email}"
}
resource "google_artifact_registry_repository_iam_member" "deploy" {
  for_each   = local.environments
  location   = local.region
  repository = "proinspect-migration-${each.key}"
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy[each.key].email}"
}
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "proinspect-migration"
  display_name              = "ProInspect migration GitHub only"
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping                  = { "google.subject" = "assertion.sub", "attribute.repository_id" = "assertion.repository_id" }
  attribute_condition                = "assertion.repository_id == '1406530255' && assertion.repository_owner_id == '235419395' && assertion.ref == 'refs/heads/migration/google-cloud-foundation' && assertion.workflow_ref == 'info-rbp/proinspect/.github/workflows/google-cloud-foundation.yml@refs/heads/migration/google-cloud-foundation' && assertion.event_name == 'push'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account_iam_member" "federation" {
  for_each           = local.environments
  service_account_id = google_service_account.deploy[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/repo:info-rbp/proinspect:environment:gcp-${each.key}"
}
resource "google_monitoring_alert_policy" "errors" {
  display_name = "ProInspect migration proof 5xx"
  combiner     = "OR"
  conditions {
    display_name = "Cloud Run proof errors"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.label.response_code_class = \"5xx\" AND resource.label.service_name = starts_with(\"proinspect-migration-\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "60s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  alert_strategy { auto_close = "1800s" }
}
resource "google_billing_budget" "foundation" {
  billing_account = var.billing_account
  display_name    = "ProInspect migration project AUD 40 warning"
  budget_filter { projects = ["projects/${local.project_number}"] }
  amount {
    specified_amount {
      currency_code = "AUD"
      units         = "40"
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }
}
output "services" { value = { for k, v in google_cloud_run_v2_service.proof : k => v.uri } }
output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
