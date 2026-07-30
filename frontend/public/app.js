/**
 * PFS — Peer File Share · Frontend Application Logic
 *
 * Flow:
 *  1. User drops / selects a file
 *  2. GET /api/getSasUrl → { uploadUrl (write SAS 15min), shareUrl, blobName, expiresAt }
 *  3. PUT file directly to Azure Blob Storage via uploadUrl (with XHR for progress)
 *  4. SET blob metadata (original filename) via PUT headers
 *  5. Show shareUrl with copy button
 *  6. Refresh file list
 */

'use strict';

// ── Config ──────────────────────────────────────────────────────────────────
// When served via the Express proxy, /api routes automatically forward to
// the Azure Function App. No hardcoded URLs needed.
const API_BASE = '/api';

// ── DOM References ───────────────────────────────────────────────────────────
const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const successPanel   = document.getElementById('successPanel');
const errorBanner    = document.getElementById('errorBanner');

const progressFileName = document.getElementById('progressFileName');
const progressFileSize = document.getElementById('progressFileSize');
const progressPct      = document.getElementById('progressPct');
const progressBarFill  = document.getElementById('progressBarFill');
const progressBarTrack = document.getElementById('progressBarTrack');
const progressStatus   = document.getElementById('progressStatus');

const successExpiry  = document.getElementById('successExpiry');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyBtn        = document.getElementById('copyBtn');
const copyBtnIcon    = document.getElementById('copyBtnIcon');
const copyBtnText    = document.getElementById('copyBtnText');
const uploadAnotherBtn = document.getElementById('uploadAnotherBtn');

const errorMessage   = document.getElementById('errorMessage');
const errorDismiss   = document.getElementById('errorDismiss');

const previewCard        = document.getElementById('previewCard');
const previewExpiry      = document.getElementById('previewExpiry');
const previewMediaContainer = document.getElementById('previewMediaContainer');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const previewLargeIcon   = document.getElementById('previewLargeIcon');
const previewFilename    = document.getElementById('previewFilename');
const previewFilesize    = document.getElementById('previewFilesize');
const downloadBtn        = document.getElementById('downloadBtn');
const previewUploadBtn   = document.getElementById('previewUploadBtn');
const uploadCard         = document.querySelector('.upload-card');
const heroSection        = document.querySelector('.hero');

// ── State ────────────────────────────────────────────────────────────────────
let isUploading = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format bytes to human-readable string */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/** Format ISO date to relative string */
function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);
  if (minutes < 1)  return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24)   return `${hours}h ago`;
  return `${days}d ago`;
}

/** Hours until expiry */
function hoursUntil(isoString) {
  return Math.max(0, Math.round((new Date(isoString).getTime() - Date.now()) / 3600000));
}

/** Get Lucide icon name based on MIME type */
function getFileIcon(contentType = '') {
  if (contentType.startsWith('image/'))       return 'image';
  if (contentType.startsWith('video/'))       return 'video';
  if (contentType.startsWith('audio/'))       return 'music';
  if (contentType.includes('pdf'))            return 'file-text';
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gz')) return 'archive';
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return 'table-2';
  if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'presentation';
  if (contentType.includes('word') || contentType.includes('document')) return 'file-text';
  return 'file';
}

/** Show / hide UI panels */
function showPanel(panel) {
  [uploadProgress, successPanel].forEach(p => p.classList.remove('visible'));
  if (panel) panel.classList.add('visible');
}

/** Show error banner */
function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.add('visible');
}

/** Hide error banner */
function hideError() {
  errorBanner.classList.remove('visible');
}

/** Update progress bar */
function setProgress(pct, status) {
  const clamped = Math.min(100, Math.max(0, pct));
  progressBarFill.style.width = `${clamped}%`;
  progressBarTrack.setAttribute('aria-valuenow', clamped);
  progressPct.textContent = `${Math.round(clamped)}%`;
  if (status) progressStatus.textContent = status;
}

/** Copy text to clipboard with visual feedback */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    const icon = btn.querySelector('[data-lucide]') || btn.querySelector('svg');
    const textEl = btn.querySelector('span') || btn;

    // Swap icon to checkmark
    if (copyBtnIcon) copyBtnIcon.setAttribute('data-lucide', 'check');
    if (copyBtnText) copyBtnText.textContent = 'Copied!';
    lucide.createIcons();

    setTimeout(() => {
      btn.classList.remove('copied');
      if (copyBtnIcon) copyBtnIcon.setAttribute('data-lucide', 'copy');
      if (copyBtnText) copyBtnText.textContent = 'Copy';
      lucide.createIcons();
    }, 2500);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Core Upload Flow ─────────────────────────────────────────────────────────

async function handleFile(file) {
  if (!file || isUploading) return;
  
  if (file.size > 2 * 1024 * 1024 * 1024) {
    showError('File exceeds the 2 GB limit.');
    return;
  }

  isUploading = true;
  hideError();

  // Show drop zone → progress
  dropZone.style.display = 'none';
  progressFileName.textContent = file.name;
  progressFileSize.textContent = formatBytes(file.size);

  // Set file type icon
  const iconName = getFileIcon(file.type);
  const iconEl = document.getElementById('progressFileIcon');
  if (iconEl) { iconEl.setAttribute('data-lucide', iconName); lucide.createIcons(); }

  setProgress(0, 'Requesting upload URL…');
  showPanel(uploadProgress);

  try {
    // ── Step 1: Get SAS URL from Azure Function ──────────────────────────
    const params = new URLSearchParams({
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
    });

    const sasRes = await fetch(`${API_BASE}/getSasUrl?${params}`);
    if (!sasRes.ok) {
      const err = await sasRes.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${sasRes.status}`);
    }

    const { uploadUrl, shareUrl, originalName, expiresAt, blobName } = await sasRes.json();
    
    // Override shareUrl to point to our frontend preview page
    const localShareUrl = `${window.location.origin}?file=${blobName}`;

    setProgress(5, 'Uploading directly to Azure Blob Storage…');

    // ── Step 2: Upload file directly to Blob Storage via SAS URL ────────
    await uploadWithProgress(file, uploadUrl);

    // ── Step 3: Show success ─────────────────────────────────────────────
    const hoursLeft = hoursUntil(expiresAt);
    const expiryText = hoursLeft > 48
      ? `Link expires in ${Math.floor(hoursLeft / 24)} days`
      : `Link expires in ${hoursLeft} hours`;

    shareLinkInput.value = localShareUrl;
    successExpiry.textContent = expiryText;
    showPanel(successPanel);

  } catch (err) {
    console.error('Upload failed:', err);
    showError(`Upload failed: ${err.message}`);
    resetUploadUI();
  } finally {
    isUploading = false;
  }
}

/**
 * Upload file to Azure Blob Storage using XHR for real-time progress.
 * Direct upload via SAS URL — bypasses the function for large files.
 */
function uploadWithProgress(file, sasUrl) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = 5 + (e.loaded / e.total) * 90; // 5% → 95%
        const uploaded = formatBytes(e.loaded);
        const total = formatBytes(e.total);
        setProgress(pct, `Uploading ${uploaded} of ${total}…`);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(100, 'Upload complete! ✓');
        setTimeout(resolve, 400);
      } else {
        reject(new Error(`Blob Storage returned ${xhr.status}: ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('PUT', sasUrl);
    // Required Azure Blob Storage headers
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    // Store original filename as blob metadata (fetched by getFileList)
    xhr.setRequestHeader('x-ms-meta-originalname', encodeURIComponent(file.name));
    xhr.send(file);
  });
}

/** Reset upload UI back to drop zone */
function resetUploadUI() {
  showPanel(null);
  dropZone.style.display = '';
  setProgress(0, '');
  fileInput.value = '';
}

// ── Preview & Download ───────────────────────────────────────────────────────

async function initPreview() {
  const params = new URLSearchParams(window.location.search);
  const blobName = params.get('file');
  if (!blobName) return;

  // Hide main upload UI
  uploadCard.style.display = 'none';
  heroSection.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/getFileList`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { files } = await res.json();
    
    const file = files.find(f => f.blobName === blobName);
    
    if (!file) {
      showError("This file does not exist or has expired.");
      return;
    }

    // Show preview card
    previewCard.classList.add('visible');
    previewFilename.textContent = file.originalName;
    previewFilesize.textContent = formatBytes(file.size);
    
    const hours = hoursUntil(file.expiresAt);
    previewExpiry.textContent = hours > 48 
      ? `Expires in ${Math.floor(hours / 24)} days` 
      : `Expires in ${hours} hours`;

    // Render Image Preview if applicable
    if (file.contentType.startsWith('image/')) {
      previewPlaceholder.style.display = 'none';
      
      const img = document.createElement('img');
      img.src = file.shareUrl;
      img.className = 'preview-image';
      previewMediaContainer.appendChild(img);
    } else {
      previewLargeIcon.setAttribute('data-lucide', getFileIcon(file.contentType));
    }

    // Download Action
    downloadBtn.onclick = () => {
      downloadBtn.innerHTML = '<i data-lucide="loader" class="spinning"></i> <span>Downloading...</span>';
      lucide.createIcons();
      forceDownload(file.shareUrl, file.originalName).finally(() => {
        downloadBtn.innerHTML = '<i data-lucide="download"></i> <span>Download File</span>';
        lucide.createIcons();
      });
    };

    previewUploadBtn.onclick = () => {
      window.location.href = '/';
    };

  } catch (err) {
    console.error('Failed to load file details:', err);
    showError("Failed to load file details.");
  }
}

async function forceDownload(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) {
    showError('Could not download file: ' + err.message);
  }
}

// (Removed initPreviewMode as it's merged into initPreview above)

// ── Event Listeners ──────────────────────────────────────────────────────────

// Drop Zone — click
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

// File input change
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});

// Paste from clipboard (Ctrl+V anywhere on page)
document.addEventListener('paste', (e) => {
  const file = e.clipboardData?.files[0];
  if (file && !isUploading) handleFile(file);
});

// Copy button
copyBtn.addEventListener('click', () => copyToClipboard(shareLinkInput.value, copyBtn));

// Upload another
uploadAnotherBtn.addEventListener('click', () => {
  showPanel(null);
  dropZone.style.display = '';
  fileInput.value = '';
  hideError();
});

// Dismiss error
errorDismiss.addEventListener('click', hideError);

// ── Initialise ───────────────────────────────────────────────────────────────
initPreview();
