/**
 * PFS - onFileUploaded Blob Trigger
 *
 * Fires automatically whenever a new file lands in the pfs-uploads container.
 * Logs file metadata — captured by Application Insights when connected.
 * Demonstrates event-driven serverless architecture.
 *
 * Connection uses identity-based auth (BlobStorageConnection__blobServiceUri app setting).
 */

const { app } = require('@azure/functions');

app.storageBlob('onFileUploaded', {
  path: 'pfs-uploads/{name}',
  connection: 'BlobStorageConnection',
  handler: async (blob, context) => {
    const blobName = context.triggerMetadata.name;
    const sizeKb = blob.length ? (blob.length / 1024).toFixed(2) : 'unknown';
    const timestamp = new Date().toISOString();

    // Strip UUID prefix to get the original display name
    const displayName = blobName.replace(/^[a-f0-9-]{36}-/, '');

    context.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    context.log(`📁 NEW FILE UPLOADED`);
    context.log(`   Blob Name    : ${blobName}`);
    context.log(`   Display Name : ${displayName}`);
    context.log(`   Size         : ${sizeKb} KB`);
    context.log(`   Timestamp    : ${timestamp}`);
    context.log(`   Auto-delete  : in 3 days (lifecycle policy)`);
    context.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Application Insights will capture these logs automatically.
    // Future extension points:
    //   - Generate image thumbnails (for image files)
    //   - Send email/webhook notification
    //   - Scan for malware via Azure Defender
    //   - Index metadata in Cosmos DB for search
  },
});
