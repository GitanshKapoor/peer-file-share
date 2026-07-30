# ============================================================
# PFS API — Azure Functions v4 Docker Image
# Base: Microsoft's official Azure Functions Node 18 image
# ============================================================

FROM mcr.microsoft.com/azure-functions/node:4-node18

# Azure Functions expects code at /home/site/wwwroot
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    # Functions runs on port 80 inside the container
    FUNCTIONS_WORKER_RUNTIME=node

WORKDIR /home/site/wwwroot

# Install dependencies first (layer caching — only re-runs if package.json changes)
COPY package*.json ./
RUN npm install --omit=dev

# Copy function code
COPY host.json ./
COPY src/ ./src/

# Port 80 is the Azure Functions container default
EXPOSE 80
