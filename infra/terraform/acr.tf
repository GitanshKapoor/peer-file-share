# ============================================================
# PFS — Azure Container Registry (ACR)
# Stores Docker images for the frontend and API.
# CI/CD builds images and pushes here → App Service/Functions pull from here.
# ============================================================

resource "azurerm_container_registry" "main" {
  name                = "pfsacr${local.suffix}"   # must be globally unique, alphanumeric only
  resource_group_name = data.azurerm_resource_group.main.name
  location            = data.azurerm_resource_group.main.location
  sku                 = "Basic"    # Basic = cheapest, good for dev/lab
  admin_enabled       = true       # Enables username/password login for App Service

  tags = local.common_tags
}

# ── Allow App Service to pull from ACR ────────────────────────
# App Service needs AcrPull role to pull images from ACR
# (Commented out — lab accounts can't assign roles.
#  In production, uncomment this and set admin_enabled = false)
#
# resource "azurerm_role_assignment" "app_acr_pull" {
#   scope                = azurerm_container_registry.main.id
#   role_definition_name = "AcrPull"
#   principal_id         = azurerm_linux_web_app.main.identity[0].principal_id
# }
#
# resource "azurerm_role_assignment" "func_acr_pull" {
#   scope                = azurerm_container_registry.main.id
#   role_definition_name = "AcrPull"
#   principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
# }
