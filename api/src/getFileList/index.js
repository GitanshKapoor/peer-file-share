/**
 * PFS - getFileList Azure Function
 *
 * HTTP GET trigger that lists all blobs in the pfs-uploads container.
 * Uses StorageSharedKeyCredential (account key via encrypted App Setting).
 */

const { app } = require('@azure/functions');
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const crypto = require('crypto');

// Polyfill for Azure SDKs that rely on globalThis.crypto.randomUUID in Node 18 runtimes
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
} else if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = crypto.randomUUID;
}

app.http('getFileList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const accountName   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const accountKey    = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'pfs-uploads';

      if (!accountName || !accountKey) {
        throw new Error('AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY must be set');
      }

      const credential       = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const files = [];

      for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
        const blobClient = containerClient.getBlobClient(blob.name);

        const createdOn  = blob.properties.createdOn ? new Date(blob.properties.createdOn) : new Date();
        const expiresAt  = new Date(createdOn.valueOf() + 3 * 24 * 60 * 60 * 1000);

        files.push({
          blobName:     blob.name,
          originalName: blob.metadata?.originalname
            ? decodeURIComponent(blob.metadata.originalname)
            : blob.name.replace(/^[a-f0-9-]{36}-/, ''),
          size:         blob.properties.contentLength || 0,
          contentType:  blob.properties.contentType || 'application/octet-stream',
          createdAt:    createdOn.toISOString(),
          expiresAt:    expiresAt.toISOString(),
          shareUrl:     blobClient.url,
        });
      }

      files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      context.log(`Listed ${files.length} file(s) from ${containerName}`);

      return {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        },
        body: JSON.stringify({ files, count: files.length }),
      };
    } catch (error) {
      context.error('getFileList error:', error.message);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to list files', details: error.message }),
      };
    }
  },
});
