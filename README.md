# PFS — Peer File Share

> A modern, serverless file-sharing application built on Microsoft Azure.  
> Drop a file → get a shareable link → files auto-delete after **3 days**.

---

## Architecture

```
Browser
  │
  ├─► Azure App Service  (Frontend: Express + Static)
  │     └─ Deployment Slots  (Blue 🔵 Production / Green 🟢 Staging)
  │           │
  │           │  Proxy /api/*
  │           ▼
  │     Azure Function App  (HTTP + Blob Triggers, Node.js v4)
  │           │  Managed Identity (no secrets!)
  │           ▼
  │     Azure Blob Storage  (pfs-uploads container)
  │           └─ Lifecycle Policy: auto-delete after 3 days
  │
  └─► Azure Blob Storage  (direct upload via SAS write URL)
```

**Key Azure concepts covered:**
- Azure App Service + Deployment Slots (blue-green)
- Azure Functions v4 (HTTP trigger + Blob trigger)
- Azure Blob Storage + Lifecycle Management
- Managed Identity + RBAC (zero secrets in production)
- User Delegation SAS tokens
- GitHub Actions CI/CD

---

## Project Structure

```
.
├── api/                          # Azure Functions v4 (Node.js)
│   ├── src/
│   │   ├── getSasUrl/index.js    # Generate write SAS + share URL
│   │   ├── getFileList/index.js  # List uploaded files
│   │   └── onFileUploaded/index.js  # Blob trigger — log events
│   ├── host.json
│   ├── local.settings.json       # ← gitignored, local dev only
│   └── package.json
├── frontend/                     # App Service frontend
│   ├── server.js                 # Express: static serve + /api proxy + /health
│   ├── public/
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   └── package.json
├── infra/
│   ├── provision.sh              # ← Run this first!
│   └── teardown.sh
├── .github/workflows/
│   ├── deploy-frontend.yml       # Blue-green deployment pipeline
│   └── deploy-api.yml            # Functions deployment
└── .gitignore
```

---

## Getting Started

### Prerequisites

```bash
# Azure CLI
brew install azure-cli      # macOS
az login

# Node.js v18+
node --version

# Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# (Optional) For local blob trigger testing
# Install Azurite: https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite
```

---

## Step 1: Provision Azure Resources

```bash
chmod +x infra/provision.sh
./infra/provision.sh
```

This script provisions (in order):
1. Resource Group
2. Storage Account + Blob Container (public blob read)
3. CORS on Blob Storage
4. Lifecycle Policy (delete after 3 days)
5. App Service Plan (S1 — required for slots)
6. App Service + Staging Slot
7. Azure Function App (Consumption)
8. Managed Identities on both services
9. RBAC: `Storage Blob Data Contributor` + `Storage Blob Delegator` → Function
10. App Settings (no connection strings!)

> ⚠️ Note: RBAC role assignments take **5–10 minutes** to propagate after provisioning.

---

## Step 2: Configure Local Development

Edit `api/local.settings.json`:
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_ACCOUNT_NAME": "your-real-storage-account-name",
    "AZURE_STORAGE_CONTAINER_NAME": "pfs-uploads",
    "BlobStorageConnection__blobServiceUri": "https://your-storage-account.blob.core.windows.net"
  }
}
```

> **For local dev, `DefaultAzureCredential` uses your `az login` session.**  
> You must assign yourself the `Storage Blob Data Contributor` and `Storage Blob Delegator` roles on the storage account.

```bash
# Assign roles to yourself for local dev
MY_ID=$(az ad signed-in-user show --query id --output tsv)
STORAGE_ID=$(az storage account show --name <your-account> --resource-group pfs-rg --query id --output tsv)

az role assignment create --assignee $MY_ID --role "Storage Blob Data Contributor" --scope $STORAGE_ID
az role assignment create --assignee $MY_ID --role "Storage Blob Delegator" --scope $STORAGE_ID
```

---

## Step 3: Run Locally

```bash
# Terminal 1 — Start Azure Functions
cd api
npm install
func start

# Terminal 2 — Start Frontend
cd frontend
npm install
AZURE_FUNCTION_URL=http://localhost:7071 node server.js

# Open http://localhost:8080
```

---

## Step 4: Deploy via CI/CD

### Add GitHub Secrets

Go to your GitHub repo → **Settings → Secrets and Variables → Actions**:

| Secret | Value |
|---|---|
| `AZURE_CREDENTIALS` | Output of `az ad sp create-for-rbac` (see below) |
| `AZURE_RESOURCE_GROUP` | `pfs-rg` |
| `AZURE_APP_SERVICE_NAME` | Your App Service name (from `.env.azure`) |
| `AZURE_FUNCTION_APP_NAME` | Your Function App name (from `.env.azure`) |

```bash
# Create a Service Principal for GitHub Actions
az ad sp create-for-rbac \
  --name "pfs-github-actions" \
  --role contributor \
  --scopes /subscriptions/<your-sub-id>/resourceGroups/pfs-rg \
  --sdk-auth
# Copy the full JSON output → paste as AZURE_CREDENTIALS secret
```

### Deploy

```bash
git add .
git commit -m "feat: initial PFS deployment"
git push origin main
```

GitHub Actions will:
1. Build the frontend
2. Deploy to **staging slot** 🟢
3. Run smoke tests (`/health` endpoint)
4. If ✅ → **swap to production** 🔵 (zero downtime)
5. If ❌ → abort, production untouched

---

## Manual Blue-Green Operations

```bash
# Deploy to staging manually
az webapp deployment source config-zip \
  --name <app-service-name> \
  --resource-group pfs-rg \
  --slot staging \
  --src frontend-deploy.zip

# Swap staging → production
az webapp deployment slot swap \
  --name <app-service-name> \
  --resource-group pfs-rg \
  --slot staging

# Emergency rollback (swap back)
az webapp deployment slot swap \
  --name <app-service-name> \
  --resource-group pfs-rg \
  --slot staging
```

---

## Managed Identity — How It Works

```
No connection strings. No secrets.

Azure Function (Managed Identity)
  ─── Token from Azure AD ──►  Azure Blob Storage
          │                         │
          │  Has RBAC Role?         │
          │  Storage Blob Data      │
          │  Contributor ✅         │
          └──────────────────────►  Access Granted
```

`DefaultAzureCredential` from `@azure/identity` automatically:
- On Azure: uses the Function's System-Assigned Managed Identity
- Locally: uses your `az login` session

---

## Cleanup

```bash
chmod +x infra/teardown.sh
./infra/teardown.sh pfs-rg
```

> ⚠️ This permanently deletes all resources and all uploaded files.

---

## Azure Cost Estimate (approximate)

| Resource | Tier | Est. Monthly |
|---|---|---|
| App Service Plan | Standard S1 | ~$73/mo |
| Azure Functions | Consumption (first 1M calls free) | ~$0 |
| Blob Storage | LRS Standard | ~$0.02/GB |
| **Total** | | **~$73/mo** |

> 💡 Switch to **Basic B1** App Service Plan to save ~$45/mo, but you'll lose deployment slots.

---

## What You're Learning

| Concept | Where |
|---|---|
| **Serverless compute** | Azure Functions (`api/src/`) |
| **Blob Storage + SAS** | `getSasUrl/index.js` |
| **Managed Identity** | `DefaultAzureCredential`, RBAC roles |
| **Blue-green deployment** | App Service Slots + `deploy-frontend.yml` |
| **Event-driven** | Blob Trigger in `onFileUploaded/index.js` |
| **Lifecycle Management** | Auto-delete policy in `provision.sh` |
| **CI/CD** | GitHub Actions workflows |
