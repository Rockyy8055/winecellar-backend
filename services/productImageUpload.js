const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('./s3Client');

const bucketName = process.env.AWS_S3_BUCKET;
const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL;
const region = process.env.AWS_REGION;

function sanitizeFilename(filename = '') {
  const ext = path.extname(filename || '').toLowerCase();
  const nameWithoutExt = path.basename(filename || '', ext);
  const safeName = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  return `${safeName}${ext || ''}`;
}

function buildObjectKey(productId, originalname) {
  const timestamp = Date.now();
  const safeFilename = sanitizeFilename(originalname);
  return `products/${productId}/${timestamp}-${safeFilename}`;
}

function buildPublicUrl(key) {
  if (publicBaseUrl) {
    const base = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
    return `${base}/${key}`;
  }
  if (!region || region === 'us-east-1') {
    return `https://${bucketName}.s3.amazonaws.com/${key}`;
  }
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
}

async function uploadProductImage(productId, file) {
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET is not configured');
  }
  if (!file || !file.buffer) {
    throw new Error('No file buffer provided for upload');
  }
  if (!productId) {
    throw new Error('Product ID is required for image upload');
  }

  const key = buildObjectKey(productId, file.originalname || 'image');
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
    ACL: 'public-read',
  });

  await s3Client.send(command);

  return {
    key,
    url: buildPublicUrl(key),
  };
}

module.exports = {
  uploadProductImage,
};
