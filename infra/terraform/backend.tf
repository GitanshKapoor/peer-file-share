terraform {
  backend "azurerm" {
    resource_group_name  = "<resource-group-name>"
    storage_account_name = "<account-name>"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}