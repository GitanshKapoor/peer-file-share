# ============================================================
# PFS — Peer File Share · Terraform
# Provider & Terraform configuration
# ============================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Uncomment to store state in Azure Blob Storage (recommended for teams)
  # backend "azurerm" {
  #   resource_group_name  = "pfs-tfstate-rg"
  #   storage_account_name = "pfstfstate"
  #   container_name       = "tfstate"
  #   key                  = "pfs.terraform.tfstate"
  # }
}

provider "azurerm" {
  # Lab environments don't have permission to register Resource Providers
  # at the subscription level — disabling auto-registration fixes this
  resource_provider_registrations = "none"

  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# ── Resource Group (EXISTING — read only, not created by Terraform) ──────
# Uses your pre-existing lab resource group instead of creating a new one.
# Set resource_group_name in terraform.tfvars to match your existing RG.
data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

# ── Random suffix for globally-unique names ──────────────────
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# ── Locals ───────────────────────────────────────────────────
locals {
  suffix = random_string.suffix.result

  # Enforce globally unique names
  storage_account_name  = "pfsstorage${local.suffix}"
  app_service_name      = "pfs-app-${local.suffix}"
  function_app_name     = "pfs-func-${local.suffix}"

  common_tags = {
    project     = "pfs"
    environment = var.environment
    managed_by  = "terraform"
  }
}
