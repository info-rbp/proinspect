# On first-ever bootstrap only, omit this file until the bucket exists, then migrate state.
terraform {
  backend "gcs" {
    bucket = "proinspect-property-services-migration-tfstate"
    prefix = "bootstrap"
  }
}
