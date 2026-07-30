# Terraform Variables

variable "resource_group_name" {
  description = "Name of the Azure Resource Group"
  type        = string
  default     = "pfs-rg"
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production"
  }
}

variable "app_service_plan_sku" {
  description = "App Service Plan SKU. Must be S1 or higher for deployment slots."
  type        = string
  default     = "S1"

  validation {
    condition     = contains(["S1", "S2", "S3", "P1v3", "P2v3", "P3v3"], var.app_service_plan_sku)
    error_message = "SKU must be Standard or Premium tier to support deployment slots."
  }
}

variable "node_version" {
  description = "Node.js version for App Service and Function App"
  type        = string
  default     = "18-lts"
}

variable "blob_container_name" {
  description = "Name of the blob container for file uploads"
  type        = string
  default     = "pfs-uploads"
}

variable "file_retention_days" {
  description = "Number of days before uploaded files are automatically deleted"
  type        = number
  default     = 7

  validation {
    condition     = var.file_retention_days >= 1 && var.file_retention_days <= 365
    error_message = "file_retention_days must be between 1 and 365."
  }
}

variable "cors_allowed_origins" {
  description = "CORS allowed origins for Blob Storage direct uploads. Use ['*'] for development."
  type        = list(string)
  default     = ["*"]
}
