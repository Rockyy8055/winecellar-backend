const SAFE_SIZE_KEYS = ['1_5_LTR', '1_LTR', '75_CL', '70_CL', '35_CL', '20_CL', '10_CL', '5_CL'];

const SIZE_ALIAS_MAP = new Map([
  ['1500ML', '1_5_LTR'],
  ['1.5LTR', '1_5_LTR'],
  ['1.5L', '1_5_LTR'],
  ['1 5 LTR', '1_5_LTR'],
  ['1-5-LTR', '1_5_LTR'],
  ['150CL', '1_5_LTR'],
  ['1500', '1_5_LTR'],
  ['1000ML', '1_LTR'],
  ['1LTR', '1_LTR'],
  ['1L', '1_LTR'],
  ['100CL', '1_LTR'],
  ['750ML', '75_CL'],
  ['75CL', '75_CL'],
  ['700ML', '70_CL'],
  ['70CL', '70_CL'],
  ['350ML', '35_CL'],
  ['35CL', '35_CL'],
  ['200ML', '20_CL'],
  ['20CL', '20_CL'],
  ['100ML', '10_CL'],
  ['10CL', '10_CL'],
  ['50ML', '5_CL'],
  ['5CL', '5_CL'],
]);

function normalizeSizeKey(raw) {
  if (raw === undefined || raw === null) {
    return '';
  }

  let normalized = String(raw)
    .toUpperCase()
    .replace(/LITRES?/g, 'LTR')
    .replace(/\s+/g, '')
    .replace(/-/g, '_')
    .replace(/\./g, '_');

  if (normalized.endsWith('LTR') && !normalized.endsWith('_LTR')) {
    normalized = `${normalized.slice(0, -3)}_LTR`;
  }

  if (normalized.endsWith('CL') && !normalized.endsWith('_CL')) {
    normalized = `${normalized.slice(0, -2)}_CL`;
  }

  if (SAFE_SIZE_KEYS.includes(normalized)) {
    return normalized;
  }

  return SIZE_ALIAS_MAP.get(normalized) || SIZE_ALIAS_MAP.get(normalized.replace(/_/g, '')) || '';
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

    const canonicalKey = SAFE_SIZE_KEYS.includes(key) ? key : SIZE_ALIAS_MAP.get(key);
    if (!canonicalKey) {
      if (rejectUnknown) {
        throw new Error(`Invalid size: ${key}`);
      }
      continue;
    }

    const quantity = coerceQuantity(rawValue, canonicalKey, coerce);
    normalized[canonicalKey] = quantity;
  }

  return fillMissing ? fillMissingKeys(normalized) : normalized;
}

function normalizeSizeStocksForResponse(raw) {
  const normalized = parseSizeStocksInput(raw, { rejectUnknown: false, fillMissing: true, coerce: 'soft' });
  return normalized ?? createEmptySizeStocks();
}

function normalizeSizeInput(value) {
  const normalized = normalizeSizeKey(value);
  if (!normalized) {
    return '';
  }
  if (SAFE_SIZE_KEYS.includes(normalized)) {
    return normalized;
  }
  const alias = SIZE_ALIAS_MAP.get(normalized);
  return alias || normalized;
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
  normalizeSizeInput,
  computeTotalStock,
  createEmptySizeStocks,
  fillMissingKeys,
};
