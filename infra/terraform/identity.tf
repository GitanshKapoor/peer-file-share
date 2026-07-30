# Managed Identity RBAC assignments for Blob Storage access.

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
