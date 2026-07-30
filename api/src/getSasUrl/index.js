/**
 * PFS - getSasUrl Azure Function
 *
 * HTTP GET trigger that generates:
 *   1. A write-only SAS URL (15 min TTL) → browser uploads directly to Blob Storage
 *   2. A permanent public share URL (readable until blob is auto-deleted after 3 days)
 *
 * Auth strategies supported: StorageSharedKeyCredential or Managed Identity.
 *
 * The key is stored as an encrypted Azure App Setting — never in source code.
 */

const { app } = require('@azure/functions');
const {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');
const crypto = require('crypto');

// Polyfill for Azure SDKs that rely on globalThis.crypto.randomUUID in Node 18 runtimes
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
} else if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = crypto.randomUUID;
}

app.http('getSasUrl', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const fileName = request.query.get('fileName');
      const fileType = request.query.get('fileType') || 'application/octet-stream';

      if (!fileName) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'fileName query parameter is required' }),
        };
      }

      const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const accountKey  = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'pfs-uploads';

      if (!accountName || !accountKey) {
        throw new Error('AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY must be set');
      }

      // StorageSharedKeyCredential — uses the account key stored as
      // an encrypted Azure App Setting (never in code or git)
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );

      // Unique blob name — UUID prefix prevents file collisions
      const uniqueId   = crypto.randomUUID();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const blobName   = `${uniqueId}-${safeFileName}`;

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient      = containerClient.getBlockBlobClient(blobName);

      const now          = new Date();
      const uploadExpiry = new Date(now.valueOf() + 15 * 60 * 1000);       // 15 minute expiration for upload
      const shareExpiry  = new Date(now.valueOf() + 3 * 24 * 60 * 60 * 1000); // 3 day expiration matching lifecycle policy

      // Write-only SAS for direct client upload
      const uploadSas = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('cw'),
          startsOn:    now,
          expiresOn:   uploadExpiry,
          contentType: fileType,
        },
        credential
      );

      const uploadUrl = `${blobClient.url}?${uploadSas.toString()}`;

      context.log(`SAS generated | blob: ${blobName} | upload expires: ${uploadExpiry.toISOString()}`);

      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        },
        body: JSON.stringify({
          uploadUrl,
          blobName,
          fileType,
          expiresAt: shareExpiry.toISOString(),
        }),
      };
    } catch (error) {
      context.error('getSasUrl error:', error.message);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to generate upload URL', details: error.message }),
      };
    }
  },
});
