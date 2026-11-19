variable "adapters_enabled" {
  type        = bool
  default     = true
  description = "Enable the tested storage, task and secret bindings for both nonproduction services."
}
resource "google_storage_bucket_iam_member" "runtime_objects" {
  for_each = google_storage_bucket.documents
  bucket   = each.value.name
  role     = "roles/storage.objectUser"
  member   = "serviceAccount:${google_service_account.runtime[local.buckets[each.key].environment].email}"
}
resource "google_secret_manager_secret_iam_member" "runtime_key" {
  for_each  = google_secret_manager_secret.encryption
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.key].email}"
}
resource "google_cloud_tasks_queue_iam_member" "runtime_enqueue" {
  for_each = google_cloud_tasks_queue.events
  name     = each.value.name
  location = local.region
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

# Cloud Tasks authorizes the enqueuer against the OIDC identity set on the queue.
resource "google_service_account_iam_member" "runtime_task_identity" {
  for_each           = local.environments
  service_account_id = google_service_account.invoker[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.runtime[each.key].email}"
}
