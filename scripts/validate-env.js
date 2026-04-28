// scripts/validate-env.js
require('dotenv').config();

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'AUDIT_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
];

// Optional vars (warn if missing, but don't crash)
const OPTIONAL_VARS = [
  'GITHUB_WEBHOOK_SECRET'
];

console.log('🔍 Validating environment variables...\n');

let hasError = false;

// Check Required Variables
REQUIRED_VARS.forEach((key) => {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ Missing required variable: ${key}`);
    hasError = true;
  } else if (value.length < 10) {
    console.error(`⚠️  Warning: ${key} looks suspiciously short (${value.length} chars).`);
  } else {
    console.log(`✅ ${key} is set.`);
  }
});

console.log('\n---\n');

// Check Optional Variables
OPTIONAL_VARS.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️  Optional variable missing: ${key} (Some features may be disabled)`);
  } else {
    console.log(`✅ ${key} is set.`);
  }
});

console.log('\n---\n');

if (hasError) {
  console.error('🛑 Validation FAILED. Please fix the missing variables and try again.');
  process.exit(1);
} else {
  console.log('✨ All required environment variables are valid!');
  process.exit(0);
}
