const requiredVars = [
  { name: 'AWS_REGION', required: true },
  { name: 'AWS_S3_BUCKET', required: true },
  { name: 'AWS_ACCESS_KEY_ID', required: true },
  { name: 'AWS_SECRET_ACCESS_KEY', required: true },
  { name: 'AWS_S3_PUBLIC_BASE_URL', required: false },
];

const results = requiredVars.map(({ name, required }) => {
  const value = process.env[name];
  const present = value != null && value !== '';
  return {
    name,
    required,
    present,
    preview: present ? `${value.slice(0, 4)}… (len ${value.length})` : null,
  };
});

console.log('AWS environment variable audit:');
results.forEach(({ name, required, present, preview }) => {
  if (present) {
    console.log(`- ${name}: PRESENT${preview ? ` -> ${preview}` : ''}`);
  } else {
    console.log(`- ${name}: MISSING${required ? ' (required)' : ' (optional)'}`);
  }
});

const missingRequired = results.filter(r => r.required && !r.present);
if (missingRequired.length) {
  process.exitCode = 1;
  console.log(`Missing ${missingRequired.length} required variable(s).`);
} else {
  console.log('All required variables are set.');
}
