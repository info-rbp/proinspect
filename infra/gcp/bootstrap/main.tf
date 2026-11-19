terraform {
  required_version = ">= 1.15, < 2.0"
  required_providers { google = { source = "hashicorp/google", version = "~> 7.0" } }
}
provider "google" {
  project = "proinspect-property-services"
}
locals {
  project  = "proinspect-property-services"
  region   = "australia-southeast1"
  labels   = { application = "proinspect", purpose = "migration-foundation", environment = "nonproduction" }
  services = toset(["run.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "cloudtasks.googleapis.com", "cloudscheduler.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "logging.googleapis.com", "monitoring.googleapis.com", "billingbudgets.googleapis.com", "cloudasset.googleapis.com"])
}
resource "google_project_service" "foundation" {
  for_each           = local.services
  project            = local.project
  service            = each.key
  disable_on_destroy = false
}
resource "google_storage_bucket" "state" {
  name                        = "proinspect-property-services-migration-tfstate"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = true }
  lifecycle_rule {
    condition { num_newer_versions = 10 }
    action { type = "Delete" }
  }
  lifecycle { prevent_destroy = true }
}
resource "google_storage_bucket" "build_source" {
  name                        = "proinspect-property-services-migration-builds"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  lifecycle_rule {
    condition { age = 7 }
    action { type = "Delete" }
  }
}
resource "google_artifact_registry_repository" "images" {
  for_each               = toset(["dev", "staging"])
  repository_id          = "proinspect-migration-${each.key}"
  location               = local.region
  format                 = "DOCKER"
  labels                 = merge(local.labels, { environment = each.key })
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "remove-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
  depends_on = [google_project_service.foundation]
}
resource "google_service_account" "builder" {
  account_id   = "pi-migration-builder"
  display_name = "ProInspect nonproduction image builder"
  depends_on   = [google_project_service.foundation]
}
resource "google_artifact_registry_repository_iam_member" "builder" {
  for_each   = google_artifact_registry_repository.images
  location   = local.region
  repository = each.value.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder.email}"
}
resource "google_storage_bucket_iam_member" "builder_source" {
  bucket = google_storage_bucket.build_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.builder.email}"
}
resource "google_project_iam_member" "builder_logs" {
  project = local.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder.email}"
}
output "state_bucket" { value = google_storage_bucket.state.name }
output "builder" { value = google_service_account.builder.email }
