const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const UPLOAD_DIR = path.join(__dirname, '../../uploads/products');
const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 5);
const MAX_FILE_SIZE_BYTES = Math.max(1, MAX_FILE_SIZE_MB) * 1024 * 1024;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png', 
  'image/webp',
  'image/gif'
]);

// MIME type to file extension mapping
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

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
  
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`);
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

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`);
  }
}

// Generate unique filename
function generateUniqueFilename(productId, originalName = '', mimeType = '') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const ext = MIME_EXTENSIONS[mimeType] || path.extname(originalName) || '.jpg';
  const safeName = sanitizeFilename(originalName) || 'image';
  return `${productId}-${timestamp}-${random}-${safeName}${ext}`;
}

// Delete old image file
async function deleteOldImage(imageUrl) {
  if (!imageUrl) return;

  try {
    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    
    if (filename) {
      const filePath = path.join(UPLOAD_DIR, filename);
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
    const filePath = path.join(UPLOAD_DIR, filename);

    // Delete old image if exists
    if (oldImageUrl) {
      await deleteOldImage(oldImageUrl);
    }

    // Write file to disk
    fs.writeFileSync(filePath, buffer);

    // Return public URL
    const publicUrl = `${BASE_URL}/uploads/products/${filename}`;

    return {
      filename,
      path: filePath,
      url: publicUrl,
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
    const filePath = path.join(UPLOAD_DIR, filename);

    // Delete old image if exists
    if (oldImageUrl) {
      await deleteOldImage(oldImageUrl);
    }

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Return public URL
    const publicUrl = `${BASE_URL}/uploads/products/${filename}`;

    return {
      filename,
      path: filePath,
      url: publicUrl,
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
  if (typeof imageInput === 'string' && imageInput.startsWith('data:')) {
    return await uploadImageFromDataUrl(productId, imageInput, oldImageUrl);
  }

  // Handle file object (from multer)
  if (imageInput && imageInput.buffer) {
    return await uploadImageFromFile(productId, imageInput, oldImageUrl);
  }

  // Handle string URL (no upload needed)
  if (typeof imageInput === 'string' && imageInput.startsWith('http')) {
    return { url: imageInput };
  }

  throw new Error('Invalid image input. Expected data URL string, file object, or image URL.');
}

module.exports = {
  uploadProductImage,
  uploadImageFromDataUrl,
  uploadImageFromFile,
  deleteOldImage,
  parseDataUrl,
  validateImageFile
};
