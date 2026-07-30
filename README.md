# Peer File Share (PFS)

> A modern, serverless file-sharing application built entirely on Microsoft Azure.  
> Drop a file → get a secure shareable link → files auto-delete after **3 days**.

````carousel
![Home Upload UI](docs/home.png)
<!-- slide -->
![Uploading State](docs/uploading.png)
<!-- slide -->
![Success State with Shareable Link](docs/success.png)
<!-- slide -->
![Secure Preview UI](docs/preview.png)
````

PFS is an enterprise-grade reference architecture demonstrating how to leverage Azure Serverless technologies to build highly scalable, cost-optimized applications. 

By utilizing **Write-Only SAS Tokens**, the frontend client uploads massive 2 GB+ files directly to Azure Blob Storage. This pattern completely bypasses the server memory limits and timeout constraints typical of Azure Functions and App Services, allowing the application to scale infinitely while costing nearly $0 to operate at rest.

---

## ✨ Enterprise Architecture Highlights

- **Zero-Trust Security**: Built entirely with **Azure Managed Identities** and Role-Based Access Control (RBAC). The production environment contains absolutely zero hardcoded connection strings or storage keys.
- **Serverless Scalability**: The backend is powered by Azure Functions on a Consumption plan, allowing it to scale instantly from zero to thousands of concurrent requests.
- **Cost Optimization**: Direct-to-blob uploads mean the backend only processes lightweight JSON metadata requests, dramatically reducing compute execution costs.
- **Automated Lifecycle Management**: Blob Storage is configured with a strict data retention policy that automatically purges files older than 3 days, eliminating manual database cleanup and runaway storage costs.
- **Zero-Downtime Releases**: Infrastructure as Code (Terraform) provisions Azure App Service Deployment Slots, enabling automated blue-green deployments via GitHub Actions.

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    Client["💻 Client Browser<br>(Vanilla JS SPA)"]
    
    subgraph AppService ["Azure App Service (Blue/Green Slots)"]
        Proxy["Node.js Express<br>(Static Asset Server & API Proxy)"]
    end
    
    subgraph Serverless ["Azure Functions (Consumption Tier)"]
        SAS["getSasUrl (HTTP Trigger)"]
        List["getFileList (HTTP Trigger)"]
        Trigger["onFileUploaded (Blob Trigger)"]
        MI["System-Assigned Managed Identity<br>(Zero Secrets Auth)"]
    end
    
    subgraph Storage ["Azure Blob Storage"]
        Container["pfs-uploads Container"]
        Lifecycle["Data Lifecycle Policy<br>(Auto-Delete 3 Days)"]
    end
    
    Client -- "1. Request Upload URL" --> Proxy
    Proxy -- "2. Route to /api" --> SAS
    SAS -- "3. Authenticate via RBAC" --> MI
    MI -. "4. Issue Write-Only SAS" .-> Storage
    SAS -- "5. Return Short-Lived Token" --> Client
    Client == "6. Direct Binary Upload<br>(Bypasses Compute Memory)" ==> Container
    Container -- "7. Async Event" --> Trigger
```

---

## 🚀 End-to-End Setup & Provisioning

The entire Azure infrastructure (App Services, Functions, Storage, RBAC Roles) is codified in Terraform for rapid, reproducible deployments.

👉 **[Read the comprehensive End-to-End Setup Guide (SETUP.md)](SETUP.md)**

The setup guide covers:
1. Automated infrastructure provisioning via Terraform
2. Local development configuration
3. Connecting your GitHub repository to Azure for CI/CD

---

## 📂 Codebase Structure

```text
.
├── api/                          # Azure Functions v4 (Node.js)
├── frontend/                     # App Service frontend (Express Proxy)
├── infra/
│   └── terraform/                # Terraform Infrastructure as Code
├── .github/workflows/
│   ├── deploy-frontend.yml       # Blue-Green Staging Deployment
│   ├── deploy-api.yml            # Functions Deployment
│   └── swap-production.yml       # Manual Zero-Downtime Swap Trigger
└── docker-compose.yml            # Local dev stack
```

---

## 🛣️ Future Roadmap

This architecture lays the foundation for a fully enterprise-grade platform. Planned integrations include:

1. **Malware & Virus Scanning:** Implementing an Azure Event Grid trigger to invoke a ClamAV container, scanning and quarantining infected blobs instantly upon upload.
2. **Rate Limiting & DDoS Protection:** Integrating Azure API Management (APIM) in front of the Azure Functions to throttle abusive traffic.
3. **Global CDN (Content Delivery Network):** Implementing Azure Front Door to cache read-heavy blobs globally for ultra-low latency downloads.
4. **Secret Management:** Moving the remaining App Settings to Azure Key Vault, fetching secrets dynamically at runtime via Managed Identities.
5. **End-to-End (E2E) Encryption:** Encrypting files locally in the browser using the WebCrypto API before upload, ensuring absolute zero-knowledge storage where the server never sees the plaintext file.
