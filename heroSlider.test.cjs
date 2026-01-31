const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSlidesInput,
  MAX_SLIDES,
} = require('./controllers/heroSliderController');

function buildSlides(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `slide-${index + 1}`,
    title: `Title ${index + 1}`,
    subtitle: `Subtitle ${index + 1}`,
    imageUrl: `https://cdn.example.com/slide-${index + 1}.jpg`,
    url: `https://example.com/${index + 1}`,
    ...overrides,
  }));
}

test('normalizeSlidesInput trims strings, preserves order and enforces ids', () => {
  const raw = [
    { id: '  hero-1  ', title: ' Hello ', subtitle: ' World ', imageUrl: 'https://cdn.example.com/hero1.png', url: 'https://example.com/a' },
    { title: 'No ID', subtitle: 'still ok', imageUrl: 'https://cdn.example.com/hero2.png', url: '' },
  ];

  const result = normalizeSlidesInput(raw);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'hero-1');
  assert.equal(result[0].title, 'Hello');
  assert.equal(result[0].subtitle, 'World');
  assert.equal(result[0].order, 0);
  assert(result[1].id); // auto-generated
  assert.equal(result[1].title, 'No ID');
  assert.equal(result[1].url, '');
  assert.equal(result[1].order, 1);
});

test('normalizeSlidesInput rejects more than MAX_SLIDES items', () => {
  const raw = buildSlides(MAX_SLIDES + 1);
  assert.throws(() => normalizeSlidesInput(raw), /up to/);
});

test('normalizeSlidesInput rejects duplicate ids', () => {
  const raw = buildSlides(2, { id: 'dup' });
  assert.throws(() => normalizeSlidesInput(raw), /Duplicate slide id/);
});

test('normalizeSlidesInput validates image and link URLs', () => {
  const missingImage = [{ id: 'x', imageUrl: '', url: '' }];
  assert.throws(() => normalizeSlidesInput(missingImage), /imageUrl/);

  const badUrl = [{ id: 'x', imageUrl: 'https://cdn.example.com/x.jpg', url: 'ftp://example.com' }];
  assert.throws(() => normalizeSlidesInput(badUrl), /invalid link URL/);
});
