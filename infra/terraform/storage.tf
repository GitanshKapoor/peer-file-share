# ============================================================
# PFS — Azure Storage Account, Container, CORS & Lifecycle
# ============================================================

# ── Storage Account ──────────────────────────────────────────
resource "azurerm_storage_account" "main" {
  name                = local.storage_account_name
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  # Allow public blob access (individual blobs, not the full container listing)
  allow_nested_items_to_be_public = true

  # Enforce TLS 1.2+
  min_tls_version = "TLS1_2"

  # HTTPS only
  https_traffic_only_enabled      = true

  # CORS for direct browser-to-blob uploads
  blob_properties {
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "PUT", "OPTIONS"]
      allowed_origins    = var.cors_allowed_origins
      exposed_headers    = ["ETag", "x-ms-request-id", "x-ms-version", "Content-Length", "Date"]
      max_age_in_seconds = 3600
    }
  }

  tags = local.common_tags
}

# ── Blob Container ───────────────────────────────────────────
# Public blob access: individual files are publicly readable by URL
# The UUID prefix in the blob name makes them effectively unguessable
resource "azurerm_storage_container" "uploads" {
  name                  = var.blob_container_name
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "blob" # Public read for individual blobs
}

# ── Lifecycle Management Policy ──────────────────────────────
# Auto-deletes uploaded files after N days (default: 3)
# This is pure Azure config — zero application code required
resource "azurerm_storage_management_policy" "lifecycle" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "delete-after-${var.file_retention_days}-days"
    enabled = true

    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["${var.blob_container_name}/"]
    }

    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = var.file_retention_days
      }
    }
  }
}
