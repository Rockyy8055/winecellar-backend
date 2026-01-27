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

  // For image paths, use S3 bucket URL
  if (pathOrUrl.includes('uploads/') || pathOrUrl.includes('products/')) {
    return `${S3_BUCKET_URL}${ensureLeadingSlash(pathOrUrl)}`;
  }

  // For other paths, use default base URL
  return `${DEFAULT_PUBLIC_BASE_URL}${ensureLeadingSlash(pathOrUrl)}`;
}

module.exports = {
  toPublicUrl,
  PUBLIC_BASE_URL: DEFAULT_PUBLIC_BASE_URL,
};
