# ============================================================
# PFS — Terraform Outputs
# Printed after every `terraform apply` — all the URLs and
# names you need to configure your local dev and CI/CD.
# ============================================================

# ── Container Registry ───────────────────────────────────────
output "acr_login_server" {
  description = "→ GitHub Secret: ACR_LOGIN_SERVER (e.g. pfsacri4s26a.azurecr.io)"
  value       = azurerm_container_registry.main.login_server
}

output "acr_username" {
  description = "→ GitHub Secret: ACR_USERNAME"
  value       = azurerm_container_registry.main.admin_username
  sensitive   = true
}

output "acr_password" {
  description = "→ GitHub Secret: ACR_PASSWORD"
  value       = azurerm_container_registry.main.admin_password
  sensitive   = true
}

# ── URLs ─────────────────────────────────────────────────────
output "production_url" {
  description = "Live production App Service URL"
  value       = "https://${azurerm_linux_web_app.main.default_hostname}"
}

output "staging_url" {
  description = "Staging slot URL (test here before swapping to production)"
  value       = "https://${azurerm_linux_web_app_slot.staging.default_hostname}"
}

output "function_app_url" {
  description = "Azure Function App base URL"
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

# ── Resource Names (needed for GitHub Secrets & local config) ─
output "resource_group_name" {
  description = "→ GitHub Secret: AZURE_RESOURCE_GROUP"
  value       = data.azurerm_resource_group.main.name
}

output "app_service_name" {
  description = "→ GitHub Secret: AZURE_APP_SERVICE_NAME"
  value       = azurerm_linux_web_app.main.name
}

output "function_app_name" {
  description = "→ GitHub Secret: AZURE_FUNCTION_APP_NAME"
  value       = azurerm_linux_function_app.main.name
}

output "storage_account_name" {
  description = "→ api/local.settings.json: AZURE_STORAGE_ACCOUNT_NAME"
  value       = azurerm_storage_account.main.name
}

output "blob_service_uri" {
  description = "→ api/local.settings.json: BlobStorageConnection__blobServiceUri"
  value       = "https://${azurerm_storage_account.main.name}.blob.core.windows.net"
}

output "container_name" {
  description = "→ api/local.settings.json: AZURE_STORAGE_CONTAINER_NAME"
  value       = azurerm_storage_container.uploads.name
}

# ── Managed Identity IDs ──────────────────────────────────────
output "function_identity_principal_id" {
  description = "Function App's Managed Identity Principal ID (for RBAC verification)"
  value       = azurerm_linux_function_app.main.identity[0].principal_id
}

output "app_service_identity_principal_id" {
  description = "App Service Managed Identity Principal ID"
  value       = azurerm_linux_web_app.main.identity[0].principal_id
}

# ── local.settings.json Block (copy-paste ready) ─────────────
output "local_settings_json" {
  description = "Paste this into api/local.settings.json for local development"
  value       = jsonencode({
    IsEncrypted = false
    Values = {
      AzureWebJobsStorage                  = "UseDevelopmentStorage=true"
      FUNCTIONS_WORKER_RUNTIME             = "node"
      AZURE_STORAGE_ACCOUNT_NAME           = azurerm_storage_account.main.name
      AZURE_STORAGE_CONTAINER_NAME         = azurerm_storage_container.uploads.name
      BlobStorageConnection__blobServiceUri = "https://${azurerm_storage_account.main.name}.blob.core.windows.net"
    }
  })
  sensitive = false
}

# ── Summary Box ───────────────────────────────────────────────
output "next_steps" {
  description = "What to do after terraform apply"
  value       = <<-EOT

  ════════════════════════════════════════════════════════
    ✅  PFS Infrastructure Ready!

    1. Update api/local.settings.json
       AZURE_STORAGE_ACCOUNT_NAME = ${azurerm_storage_account.main.name}
       BlobStorageConnection__blobServiceUri = https://${azurerm_storage_account.main.name}.blob.core.windows.net

    2. Assign RBAC to yourself for local dev:
       az role assignment create --assignee <your-object-id> \
         --role "Storage Blob Data Contributor" \
         --scope $(az storage account show --name ${azurerm_storage_account.main.name} --query id -o tsv)

    3. Add GitHub Secrets:
       AZURE_RESOURCE_GROUP    = ${data.azurerm_resource_group.main.name}
       AZURE_APP_SERVICE_NAME  = ${azurerm_linux_web_app.main.name}
       AZURE_FUNCTION_APP_NAME = ${azurerm_linux_function_app.main.name}
       AZURE_CREDENTIALS       = (from: az ad sp create-for-rbac --sdk-auth)

    4. Start locally:
       cd api && func start
       cd frontend && AZURE_FUNCTION_URL=https://${azurerm_linux_function_app.main.default_hostname} node server.js

    5. Push to GitHub → CI/CD auto-deploys via blue-green!
  ════════════════════════════════════════════════════════
  EOT
}
