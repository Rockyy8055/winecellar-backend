const isProduction = process.env.NODE_ENV === 'production';

const DEFAULT_COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || (isProduction ? '.winecellar.co.in' : undefined);

function buildCookieOptions(overrides = {}) {
  const baseOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };

  if (DEFAULT_COOKIE_DOMAIN) {
    baseOptions.domain = DEFAULT_COOKIE_DOMAIN;
  }

  return { ...baseOptions, ...overrides };
}

module.exports = {
  buildCookieOptions,
  DEFAULT_COOKIE_DOMAIN,
  isProduction,
};

