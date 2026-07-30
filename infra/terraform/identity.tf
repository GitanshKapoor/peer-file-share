# ============================================================
# PFS — Managed Identity RBAC Assignments
#
# ⚠️  LAB ENVIRONMENT NOTE:
# These role assignments require Owner/User Access Administrator
# on the subscription, which lab accounts (Contributor) don't have.
#
# They are commented out below. In a real Azure subscription
# with Owner access, uncomment them and remove the
# AZURE_STORAGE_ACCOUNT_KEY from Function App settings in compute.tf.
#
# For this lab, the Function App uses the Storage Account Key
# (stored as an encrypted Azure App Setting) instead.
# ============================================================

# resource "azurerm_role_assignment" "func_blob_contributor" {
#   scope                = azurerm_storage_account.main.id
#   role_definition_name = "Storage Blob Data Contributor"
#   principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
#   depends_on           = [azurerm_linux_function_app.main]
# }

# resource "azurerm_role_assignment" "func_blob_delegator" {
#   scope                = azurerm_storage_account.main.id
#   role_definition_name = "Storage Blob Delegator"
#   principal_id         = azurerm_linux_function_app.main.identity[0].principal_id
#   depends_on           = [azurerm_linux_function_app.main]
# }
