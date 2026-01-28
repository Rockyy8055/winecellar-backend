const SAFE_SIZE_KEYS = ['1.5LTR', '1LTR', '75CL', '70CL', '35CL', '20CL', '10CL', '5CL'];

function normalizeSizeKey(raw) {
  if (raw === undefined || raw === null) {
    return '';
  }

  const upper = String(raw).toUpperCase().replace(/LITRES?/g, 'LTR').replace(/\s+/g, '');
  let result = '';

  for (let i = 0; i < upper.length; i += 1) {
    const char = upper[i];

    if (char === '.') {
      const prev = upper[i - 1];
      const next = upper[i + 1];
      if (isDigit(prev) && isDigit(next)) {
        result += char;
      }
      continue;
    }

    result += char;
  }

  return result;
}

function parseSizeStocksInput(raw, options = {}) {
  const {
    rejectUnknown = true,
    fillMissing = true,
    coerce = 'strict', // 'strict' | 'soft'
  } = options;

  const parsed = parseJsonMaybe(raw);
  if (parsed === undefined) {
    return undefined;
  }

  const entries = entriesFromValue(parsed);
  const normalized = {};

  for (const [rawKey, rawValue] of entries) {
    if (rawKey === undefined || rawKey === null || rawKey === '') {
      continue;
    }

    const key = normalizeSizeKey(rawKey);
    if (!key) {
      continue;
    }

    if (!SAFE_SIZE_KEYS.includes(key)) {
      if (rejectUnknown) {
        throw new Error(`Invalid size: ${key}`);
      }
      continue;
    }

    const quantity = coerceQuantity(rawValue, key, coerce);
    normalized[key] = quantity;
  }

  return fillMissing ? fillMissingKeys(normalized) : normalized;
}

function normalizeSizeStocksForResponse(raw) {
  const normalized = parseSizeStocksInput(raw, { rejectUnknown: false, fillMissing: true, coerce: 'soft' });
  return normalized ?? createEmptySizeStocks();
}

function computeTotalStock(sizeStocks = {}) {
  const normalized = parseSizeStocksInput(sizeStocks, { rejectUnknown: false, fillMissing: false, coerce: 'soft' }) || {};
  return SAFE_SIZE_KEYS.reduce((total, key) => total + (normalized[key] ?? 0), 0);
}

function createEmptySizeStocks() {
  return fillMissingKeys({});
}

function fillMissingKeys(base = {}) {
  const result = {};
  SAFE_SIZE_KEYS.forEach((key) => {
    const value = base[key];
    result[key] = normalizeSoftQuantity(value);
  });
  return result;
}

function coerceQuantity(value, key, mode = 'strict') {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    if (mode === 'soft') {
      return 0;
    }
    throw new Error(`Invalid stock value for ${key}: must be a non-negative integer`);
  }
  return Math.floor(num);
}

function normalizeSoftQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.floor(num);
}

function entriesFromValue(value) {
  if (value === null) {
    return [];
  }

  if (typeof value?.toObject === 'function') {
    return entriesFromValue(value.toObject());
  }

  if (value instanceof Map) {
    return Array.from(value.entries());
  }

  if (Array.isArray(value)) {
    return extractEntriesFromArray(value);
  }

  if (typeof value === 'object') {
    return Object.entries(value);
  }

  throw new Error('sizeStocks must be an object or array');
}

function extractEntriesFromArray(arr = []) {
  const entries = [];

  arr.forEach((item) => {
    if (!item) {
      return;
    }

    if (Array.isArray(item) && item.length >= 2) {
      entries.push([item[0], item[1]]);
      return;
    }

    if (typeof item === 'object') {
      const key = item.key ?? item.size ?? item.label ?? item.name ?? item.id;
      const quantity = item.quantity ?? item.qty ?? item.value ?? item.stock ?? item.amount;

      if (key !== undefined && quantity !== undefined) {
        entries.push([key, quantity]);
      }
    }
  });

  return entries;
}

function parseJsonMaybe(value) {
  if (value === undefined || value === null) {
    return value === null ? {} : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return value;
    }
  }

  return value;
}

function isDigit(char) {
  return typeof char === 'string' && char >= '0' && char <= '9';
}

module.exports = {
  SAFE_SIZE_KEYS,
  normalizeSizeKey,
  parseSizeStocksInput,
  normalizeSizeStocksForResponse,
  computeTotalStock,
  createEmptySizeStocks,
  fillMissingKeys,
};
