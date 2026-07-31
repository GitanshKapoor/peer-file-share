# PFS — End-to-End Setup Guide

Welcome to the **Peer File Share (PFS)** repository! 
This guide contains a complete map of every Azure credential, account name, and URL needed to run this serverless application, as well as step-by-step instructions for provisioning the infrastructure.

---

## 🗺️ Master Config Map

| Value You Need | Where It Goes | File | Secret? |
|---|---|---|---|
| Storage Account Name | `AZURE_STORAGE_ACCOUNT_NAME` | `api/local.settings.json` | ❌ No |
| Storage Account URL | `BlobStorageConnection__blobServiceUri` | `api/local.settings.json` | ❌ No |
| Function App URL | `AZURE_FUNCTION_URL` | Azure App Service App Settings | ❌ No |
| Function Host Key | `FUNCTION_KEY` | Azure App Service App Settings | ✅ Yes |
| Full SP JSON | `AZURE_CREDENTIALS` | GitHub Secret | ✅ Yes |
| Resource Group | `AZURE_RESOURCE_GROUP` | GitHub Secret | ❌ No |
| App Service Name | `AZURE_APP_SERVICE_NAME` | GitHub Secret | ❌ No |
| Function App Name | `AZURE_FUNCTION_APP_NAME` | GitHub Secret | ❌ No |

---

## Step 0 — Prerequisites (Install These First)

```bash
# 1. Azure CLI
brew install azure-cli        # macOS
# or https://docs.microsoft.com/cli/azure/install-azure-cli

# 2. Azure Functions Core Tools v4 (for running functions locally)
npm install -g azure-functions-core-tools@4

# 3. Terraform (for IaC provisioning)
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

---

## Step 1 — Log In to Azure

```bash
az login
# Browser opens → sign in → closes automatically

# List your subscriptions
az account list --output table

# Select the right one
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"

# Confirm
az account show --output table
```

> 📋 **Save**: Your `SUBSCRIPTION_ID` from the output table.

---

## Step 2 — Provision Infrastructure via Terraform

The fastest and most reliable way to create all Azure resources (App Service, Functions, Storage, Roles, and App Settings) is by using the included Terraform configuration.

### Configure Remote State Backend

Terraform uses Azure Blob Storage to securely store its state. You must create this storage account first:

```bash
# 1. Create a Resource Group for the state file (or use an existing lab group)
az group create --name "1-86f3d61c-playground-sandbox" --location eastus

# 2. Create the Storage Account
az storage account create --name "<backend-name>" --resource-group "<your-resource-name>" --location eastus --sku Standard_LRS

# 3. Create the Storage Container
az storage container create --name "tfstate" --account-name "fileshareappbackend"
```

### Provision Resources

```bash
cd infra/terraform

# Create terraform.tfvars with your values (or use the defaults)
cat > terraform.tfvars <<EOF
resource_group_name  = "<your-resource-name>"
location             = "eastus"
environment          = "production"
app_service_plan_sku = "S1"
file_retention_days  = 3
EOF

terraform init
terraform plan -out=pfs.tfplan
terraform apply pfs.tfplan

# Output your provisioned resource names and URLs
terraform output
```

> Terraform handles creating the resources, enabling Managed Identities, and assigning the correct RBAC roles automatically!

---

## Step 3 — Fill In `api/local.settings.json`

Open `api/local.settings.json` (create it if it doesn't exist) and replace the placeholders with the output from your Terraform run:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_ACCOUNT_NAME": "<storage_account_name_from_tf_output>",
    "AZURE_STORAGE_CONTAINER_NAME": "pfs-uploads",
    "BlobStorageConnection__blobServiceUri": "https://<storage_account_name_from_tf_output>.blob.core.windows.net"
  }
}
```

> ✅ **No connection string needed!** `DefaultAzureCredential` uses your `az login` session locally.
> ❌ This file is gitignored — it will NEVER be committed.

### Grant yourself RBAC for local dev:

Even though Terraform granted the Azure Function App access to the storage account, **you** need access to run the API locally on your laptop:

```bash
MY_ID=$(az ad signed-in-user show --query id --output tsv)
STORAGE_SCOPE=$(az storage account show --name "<storage_account_name_from_tf_output>" --query id --output tsv)

az role assignment create \
  --assignee "$MY_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_SCOPE"

az role assignment create \
  --assignee "$MY_ID" \
  --role "Storage Blob Delegator" \
  --scope "$STORAGE_SCOPE"
```

---

## Step 4 — Local Dev Startup

```bash
# ── Terminal 1: Azure Functions ──────────────────────────────
cd api
npm install
func start
# → http://localhost:7071/api/getSasUrl
# → http://localhost:7071/api/getFileList

# ── Terminal 2: Frontend Express Server ──────────────────────
cd frontend
npm install
AZURE_FUNCTION_URL=http://localhost:7071 node server.js
# → Open http://localhost:8080
```

---

## Step 5 — GitHub Secrets for CI/CD

To enable the automated GitHub Actions deployments, you need to create a Service Principal and save its credentials in GitHub.

### Create the Service Principal

```bash
SUB_ID=$(az account show --query id --output tsv)
RESOURCE_GROUP="<resource_group_name_from_tf_output>"

az ad sp create-for-rbac \
  --name "pfs-github-actions" \
  --role Contributor \
  --scopes "/subscriptions/$SUB_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth
```

> 📋 **Copy the entire JSON output** — you'll paste it as the `AZURE_CREDENTIALS` secret.

### Add These 4 Secrets to GitHub

Go to your repository: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Value |
|---|---|
| `AZURE_CREDENTIALS` | The full JSON from `az ad sp create-for-rbac --sdk-auth` |
| `AZURE_RESOURCE_GROUP` | The Resource Group name |
| `AZURE_APP_SERVICE_NAME` | The App Service name from Terraform output |
| `AZURE_FUNCTION_APP_NAME` | The Function App name from Terraform output |

Once these secrets are set, any push to the `main` branch will automatically trigger a build and blue-green deployment to your Azure Staging slot!

---

> [!IMPORTANT]
> **The only file you ever touch locally is `api/local.settings.json`.**
> Everything else (Function URL, Function Key) is configured directly in Azure App Settings via CLI or Terraform — never hardcoded in source files.
