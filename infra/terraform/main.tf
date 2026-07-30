# Provider & Terraform configuration

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

  # Remote backend configuration
  # backend "azurerm" {
  #   resource_group_name  = "pfs-tfstate-rg"
  #   storage_account_name = "pfstfstate"
  #   container_name       = "tfstate"
  #   key                  = "pfs.terraform.tfstate"
  # }
}

provider "azurerm" {
  # Disable provider registration for restricted subscriptions
  resource_provider_registrations = "none"

  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# Data source for existing Resource Group.
data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

# Random suffix
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# Locals
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
