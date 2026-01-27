const DEFAULT_PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://api.winecellar.co.in').replace(/\/$/, '');
const S3_BUCKET_URL = 'https://winecellar-product-images.s3.ap-south-1.amazonaws.com';

function ensureLeadingSlash(value = '') {
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
}

function toPublicUrl(pathOrUrl) {
  if (!pathOrUrl) {
    return '';
  }

  // If it's already a full URL, return as-is
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  // Image references in this project are typically stored as just a filename/key.
  // If we see an uploads-style path, strip it down to the filename and serve from S3.
  const normalized = String(pathOrUrl).trim().replace(/\\/g, '/');
  const looksLikeImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(normalized);

  if (looksLikeImage) {
    const filename = normalized.split('/').filter(Boolean).pop();
    return `${S3_BUCKET_URL}/${filename}`;
  }

  if (normalized.includes('uploads/') || normalized.includes('products/')) {
    const filename = normalized.split('/').filter(Boolean).pop();
    return `${S3_BUCKET_URL}/${filename}`;
  }

  // For other paths, use default base URL
  return `${DEFAULT_PUBLIC_BASE_URL}${ensureLeadingSlash(pathOrUrl)}`;
}

module.exports = {
  toPublicUrl,
  PUBLIC_BASE_URL: DEFAULT_PUBLIC_BASE_URL,
};
