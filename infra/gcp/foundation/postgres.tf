variable "sql_environments" {
  description = "Environments approved for a billable private SQL instance."
  type        = set(string)
  default     = []
  validation {
    condition     = length(setsubtract(var.sql_environments, ["dev", "staging"])) == 0
    error_message = "SQL can only be enabled in dev or staging."
  }
}
variable "sql_allowance_aud" {
  type        = number
  default     = 0
  description = "Reviewed monthly database allowance, in AUD before tax and traffic."
}
variable "sql_serving" {
  description = "Enable business routes only after the schema migration job succeeds."
  type        = set(string)
  default     = []
  validation {
    condition     = length(setsubtract(var.sql_serving, var.sql_environments)) == 0
    error_message = "Serving requires a provisioned migration database."
  }
}
variable "migration_image" {
  type        = string
  default     = null
  description = "Tested application image digest containing the PostgreSQL migration runner."
  validation {
    condition     = var.migration_image == null || can(regex("^australia-southeast1-docker.pkg.dev/proinspect-property-services/proinspect-migration-(dev|staging)/platform@sha256:[a-f0-9]{64}$", var.migration_image))
    error_message = "Supply an immutable nonproduction image digest."
  }
}
locals {
  sql_network_count = length(var.sql_environments) == 0 ? 0 : 1
}
resource "google_compute_network" "postgres" {
  count                   = local.sql_network_count
  name                    = "pi-migration-private"
  auto_create_subnetworks = false
}
resource "google_compute_subnetwork" "postgres" {
  count                    = local.sql_network_count
  name                     = "pi-migration-run-sydney"
  region                   = local.region
  ip_cidr_range            = "10.39.0.0/26"
  private_ip_google_access = true
  network                  = google_compute_network.postgres[0].id
}
resource "google_compute_global_address" "database_range" {
  count         = local.sql_network_count
  name          = "pi-migration-sql-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 24
  network       = google_compute_network.postgres[0].id
}
resource "google_service_networking_connection" "postgres" {
  count                   = local.sql_network_count
  network                 = google_compute_network.postgres[0].id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.database_range[0].name]
}
resource "google_sql_database_instance" "postgres" {
  for_each            = var.sql_environments
  name                = "pi-mig-${each.key}-pg"
  region              = local.region
  database_version    = "POSTGRES_17"
  deletion_protection = true
  depends_on          = [google_service_networking_connection.postgres]
  settings {
    tier                        = "db-f1-micro"
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    disk_autoresize_limit       = 20
    deletion_protection_enabled = true
    user_labels                 = merge(local.labels, { environment = each.key })
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.postgres[0].id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = false
      start_time                     = "15:00"
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }
  }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.sql_allowance_aud >= 19.53 * length(var.sql_environments) && var.migration_image != null
      error_message = "A tested migration image and reviewed allowance covering each Sydney instance are required."
    }
    ignore_changes = [settings[0].disk_size]
  }
}
resource "google_service_account" "migrate" {
  for_each   = var.sql_environments
  account_id = "pi-mig-${each.key}-migrate"
}
locals {
  sql_identities = { for pair in setproduct(var.sql_environments, ["runtime", "migrate"]) :
  "${pair[0]}-${pair[1]}" => { stage = pair[0], kind = pair[1], email = pair[1] == "runtime" ? google_service_account.runtime[pair[0]].email : google_service_account.migrate[pair[0]].email } }
  sql_grants = { for pair in setproduct(keys(local.sql_identities), ["cloudsql.client", "cloudsql.instanceUser"]) :
  "${pair[0]}-${pair[1]}" => merge(local.sql_identities[pair[0]], { role = pair[1] }) }
}
resource "google_project_iam_member" "sql_login" {
  for_each = local.sql_grants
  project  = local.project
  role     = "roles/${each.value.role}"
  member   = "serviceAccount:${each.value.email}"
  condition {
    title      = "own-migration-${each.value.stage}-sql"
    expression = "resource.name == 'projects/${local.project}/instances/${google_sql_database_instance.postgres[each.value.stage].name}'"
  }
}
resource "google_sql_user" "login" {
  for_each       = local.sql_identities
  instance       = google_sql_database_instance.postgres[each.value.stage].name
  type           = "CLOUD_IAM_SERVICE_ACCOUNT"
  name           = trimsuffix(each.value.email, ".gserviceaccount.com")
  database_roles = each.value.kind == "migrate" ? ["cloudsqlsuperuser"] : []
}
resource "google_cloud_run_v2_job" "migrate" {
  for_each            = var.sql_environments
  name                = "pi-mig-${each.key}-schema"
  location            = local.region
  deletion_protection = true
  depends_on          = [google_sql_user.login, google_project_iam_member.sql_login]
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.migrate[each.key].email
      timeout         = "300s"
      max_retries     = 0
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.postgres[0].name
          subnetwork = google_compute_subnetwork.postgres[0].name
        }
      }
      containers {
        image   = var.migration_image
        command = ["node", "apps/platform/node/google/migrate-job.mjs"]
        env {
          name  = "FOUNDATION_ENV"
          value = each.key
        }
        resources { limits = { cpu = "1", memory = "512Mi" } }
      }
    }
  }
}
resource "google_monitoring_alert_policy" "sql_disk" {
  for_each     = var.sql_environments
  display_name = "Migration ${each.key} PostgreSQL disk exceeds 80 percent"
  combiner     = "OR"
  conditions {
    display_name = "Disk utilization"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/disk/utilization\" AND resource.label.database_id = \"${local.project}:${google_sql_database_instance.postgres[each.key].name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }
}
