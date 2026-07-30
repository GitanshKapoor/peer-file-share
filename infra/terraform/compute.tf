# ============================================================
# PFS — App Service Plan, App Service + Staging Slot,
#        Function App (Consumption Plan)
# ============================================================

# ── App Service Plan (Standard S1 — required for slots) ─────
resource "azurerm_service_plan" "main" {
  name                = "pfs-plan-${local.suffix}"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku  # S1 minimum for deployment slots

  tags = local.common_tags
}

# ── Separate Consumption Plan for Functions ──────────────────
# Functions run on a Consumption (Serverless) plan — scales to zero
resource "azurerm_service_plan" "functions" {
  name                = "pfs-func-plan-${local.suffix}"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1"  # Y1 = Consumption (serverless)

  tags = local.common_tags
}

# ── App Service (Production Slot / Blue) ─────────────────────
resource "azurerm_linux_web_app" "main" {
  name                = local.app_service_name
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true

  site_config {
    always_on         = true
    health_check_path                 = "/health"   # Used for blue-green swap validation
    health_check_eviction_time_in_min = 5            # Evict instance if unhealthy for 5 mins

    application_stack {
      node_version = var.node_version
    }
  }

  # System-Assigned Managed Identity on the App Service
  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    "AZURE_FUNCTION_URL"             = "https://${local.function_app_name}.azurewebsites.net"
    "ENVIRONMENT"                    = "production"
    "NODE_ENV"                       = "production"
    "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
    "WEBSITE_NODE_DEFAULT_VERSION"   = "~18"
  }

  logs {
    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 35
      }
    }
  }

  tags = local.common_tags
}

# ── Staging Slot (Green — where you deploy before swapping) ──
resource "azurerm_linux_web_app_slot" "staging" {
  name           = "staging"
  app_service_id = azurerm_linux_web_app.main.id
  https_only     = true

  site_config {
    always_on                         = false     # Off = saves cost on staging
    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 5

    application_stack {
      node_version = var.node_version
    }
  }

  identity {
    type = "SystemAssigned"
  }

  # ENVIRONMENT is slot-sticky — it stays "staging" even after a swap
  app_settings = {
    "AZURE_FUNCTION_URL"             = "https://${local.function_app_name}.azurewebsites.net"
    "ENVIRONMENT"                    = "staging"
    "NODE_ENV"                       = "production"
    "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
    "WEBSITE_NODE_DEFAULT_VERSION"   = "~18"
  }

  tags = local.common_tags
}

# ── Azure Function App ────────────────────────────────────────
resource "azurerm_linux_function_app" "main" {
  name                = local.function_app_name
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.functions.id
  https_only          = true

  # AzureWebJobsStorage: Functions runtime uses this for its own internal state
  # (trigger leases, logs). This is NOT the user-data blob — that uses Managed Identity.
  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key

  # System-Assigned Managed Identity — how the Function accesses pfs-uploads
  # without any connection strings. RBAC roles assigned in identity.tf.
  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "18"
    }
  }

  app_settings = {
    # Storage access via account key (lab workaround — RBAC not available)
    # In production with Owner access: use Managed Identity + role assignments in identity.tf
    "AZURE_STORAGE_ACCOUNT_NAME"            = azurerm_storage_account.main.name
    "AZURE_STORAGE_ACCOUNT_KEY"             = azurerm_storage_account.main.primary_access_key
    "AZURE_STORAGE_CONTAINER_NAME"          = azurerm_storage_container.uploads.name
    "BlobStorageConnection__blobServiceUri" = "https://${azurerm_storage_account.main.name}.blob.core.windows.net"
    "ALLOWED_ORIGIN"                        = "https://${azurerm_linux_web_app.main.default_hostname}"

    # Functions runtime config
    "FUNCTIONS_EXTENSION_VERSION"  = "~4"
    "FUNCTIONS_WORKER_RUNTIME"     = "node"
    "WEBSITE_NODE_DEFAULT_VERSION" = "~18"
    "WEBSITE_RUN_FROM_PACKAGE"     = "1"
  }

  tags = local.common_tags
}
