const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { toPublicUrl } = require('../utils/publicUrl');

// Configuration
const UPLOAD_DIR = path.join(__dirname, '../../uploads/products');
const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 5);
const MAX_FILE_SIZE_BYTES = Math.max(1, MAX_FILE_SIZE_MB) * 1024 * 1024;

// Allow all image types - only validate that it starts with 'image/'
function isImageMimeType(mimeType) {
  return mimeType && mimeType.toLowerCase().startsWith('image/');
}

// Common MIME type to file extension mapping
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico'
};

// Get file extension from MIME type or default to .jpg
function getFileExtension(mimeType) {
  const ext = MIME_EXTENSIONS[mimeType?.toLowerCase()];
  if (ext) return ext;
  
  // For unknown image types, try to extract from MIME type
  if (mimeType && mimeType.startsWith('image/')) {
    const subtype = mimeType.split('/')[1];
    if (subtype) {
      return '.' + subtype.replace(/[^a-z0-9]/g, '').toLowerCase();
    }
  }
  
  return '.jpg'; // default fallback
}

// Ensure upload directory exists
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

// Sanitize filename
function sanitizeFilename(filename = '') {
  const ext = path.extname(filename || '').toLowerCase();
  const nameWithoutExt = path.basename(filename || '', ext);
  const safeName = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  return `${safeName}${ext || ''}`;
}

// Parse data URL
function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid data URL: must be a string');
  }

  const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URL format. Expected format: data:[mimeType];base64,[data]');
  }

  const [, mimeType, base64Data] = matches;
  
  // Allow all image types
  if (!isImageMimeType(mimeType)) {
    throw new Error(`Invalid image type: ${mimeType}. Only image files are allowed.`);
  }

  return {
    mimeType,
    buffer: Buffer.from(base64Data, 'base64')
  };
}

// Validate file size and type
function validateImageFile(buffer, mimeType) {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${Math.round(buffer.length / 1024 / 1024)}MB exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB`);
  }

  // Check if it's an image type (allow all image types)
  if (!isImageMimeType(mimeType)) {
    throw new Error(`Invalid image type: ${mimeType}. Only image files are allowed.`);
  }
}

// Generate unique filename
function generateUniqueFilename(productId, originalName = '', mimeType = '') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const ext = getFileExtension(mimeType) || path.extname(originalName) || '.jpg';
  const safeName = sanitizeFilename(originalName) || 'image';
  return `${productId}-${timestamp}-${random}-${safeName}${ext}`;
}

function normalizeRelativePath(value = '') {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.pathname || '';
    } catch (_) {
      // fall through to string cleanup
    }
  }
  const trimmed = value.replace(/\\/g, '/');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function resolveUploadPath(filename) {
  return path.join(UPLOAD_DIR, filename);
}

function extractFilename(imageReference = '') {
  if (!imageReference) return '';
  try {
    const asUrl = new URL(imageReference);
    return path.basename(asUrl.pathname);
  } catch (_) {
    return path.basename(imageReference);
  }
}

// Delete old image file
async function deleteOldImage(imageUrl) {
  if (!imageUrl) return;

  try {
    const filename = extractFilename(imageUrl);
    if (filename) {
      const filePath = resolveUploadPath(filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old image: ${filename}`);
      }
    }
  } catch (error) {
    console.warn('Failed to delete old image:', error.message);
  }
}

// Upload image from data URL
async function uploadImageFromDataUrl(productId, dataUrl, oldImageUrl = null) {
  try {
    ensureUploadDir();

    // Parse and validate data URL
    const { mimeType, buffer } = parseDataUrl(dataUrl);
    validateImageFile(buffer, mimeType);

    // Generate unique filename
    const filename = generateUniqueFilename(productId, '', mimeType);
    const filePath = resolveUploadPath(filename);

    // Write file to disk
    fs.writeFileSync(filePath, buffer);

    const relativePath = `/uploads/products/${filename}`;
    const publicUrl = toPublicUrl(relativePath);

    return {
      filename,
      path: filePath,
      url: publicUrl,
      relativePath,
      size: buffer.length,
      mimeType
    };

  } catch (error) {
    throw new Error(`Failed to upload image from data URL: ${error.message}`);
  }
}

// Upload image from file buffer (for regular uploads)
async function uploadImageFromFile(productId, file, oldImageUrl = null) {
  try {
    ensureUploadDir();

    if (!file || !file.buffer) {
      throw new Error('No file buffer provided for upload');
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    validateImageFile(file.buffer, mimeType);

    // Generate unique filename
    const filename = generateUniqueFilename(productId, file.originalname, mimeType);
    const filePath = resolveUploadPath(filename);

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    const relativePath = `/uploads/products/${filename}`;
    const publicUrl = toPublicUrl(relativePath);

    return {
      filename,
      path: filePath,
      url: publicUrl,
      relativePath,
      size: file.buffer.length,
      mimeType
    };

  } catch (error) {
    throw new Error(`Failed to upload image from file: ${error.message}`);
  }
}

// Main upload function that handles both data URLs and files
async function uploadProductImage(productId, imageInput, oldImageUrl = null) {
  if (!productId) {
    throw new Error('Product ID is required for image upload');
  }

  // Handle data URL
  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('data:')) {
      return await uploadImageFromDataUrl(productId, imageInput, oldImageUrl);
    }

    const relativePath = normalizeRelativePath(imageInput);
    const publicUrl = toPublicUrl(relativePath || imageInput);
    return {
      url: publicUrl,
      relativePath: relativePath || undefined,
    };
  }

  // Handle file object (from multer)
  if (imageInput && imageInput.buffer) {
    return await uploadImageFromFile(productId, imageInput, oldImageUrl);
  }

  throw new Error('Invalid image input. Expected data URL string, file object, or image path.');
}

module.exports = {
  uploadProductImage,
  uploadImageFromDataUrl,
  uploadImageFromFile,
  deleteOldImage,
  parseDataUrl,
  validateImageFile,
  extractFilename,
  resolveUploadPath,
};
