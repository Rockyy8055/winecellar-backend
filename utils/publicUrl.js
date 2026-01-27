const DEFAULT_PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://api.winecellar.co.in').replace(/\/$/, '');

function ensureLeadingSlash(value = '') {
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
}

function toPublicUrl(pathOrUrl) {
  if (!pathOrUrl) {
    return '';
  }

  const baseOrigin = DEFAULT_PUBLIC_BASE_URL;

  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      const url = new URL(pathOrUrl);
      const base = new URL(baseOrigin);
      url.protocol = base.protocol;
      url.host = base.host;
      return url.toString();
    } catch (_) {
      const withoutHost = pathOrUrl.replace(/^https?:\/\/[^/]+/i, '');
      return `${baseOrigin}${ensureLeadingSlash(withoutHost)}`;
    }
  }

  return `${baseOrigin}${ensureLeadingSlash(pathOrUrl)}`;
}

module.exports = {
  toPublicUrl,
  PUBLIC_BASE_URL: DEFAULT_PUBLIC_BASE_URL,
};
