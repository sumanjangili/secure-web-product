// frontend/scripts/generate-csp.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
const headersPath = path.join(distPath, '_headers');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distPath)) {
  console.error('❌ Error: dist folder not found.');
  console.error('   Please run "npm run build" first.');
  process.exit(1);
}

// 1. Generate nonce
const nonce = crypto.randomBytes(16).toString('base64');
console.log(`[SECURITY] Generated Nonce: ${nonce}`);

// 2. Read and modify HTML
if (!fs.existsSync(indexPath)) {
  console.error('❌ index.html not found in dist folder.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf-8');

// 3. Inject nonce - improved regex with type filtering
const scriptTagRegex = /<script(\s+[^>]*)?>/gi;

html = html.replace(scriptTagRegex, (match, attributes) => {
  // Skip if nonce already exists
  if (/nonce\s*=\s*["'].*["']/.test(match)) return match;
  
  // Skip non-executable scripts (JSON, etc.)
  if (/type\s*=\s*["'](application\/json|application\/ld\+json)["']/.test(match)) {
    return match;
  }
  
  const nonceAttr = ` nonce="${nonce}"`;
  return `<script${attributes ? attributes : ''}${nonceAttr}>`;
});

// 4. Update CSP placeholder
const placeholder = "'nonce-PLACEHOLDER'";
const newNonceValue = `'nonce-${nonce}'`;

if (html.includes(placeholder)) {
  html = html.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), newNonceValue);
  console.log('✅ Updated CSP meta tag.');
} else {
  console.warn('⚠️ CSP placeholder not found.');
}

fs.writeFileSync(indexPath, html);
console.log('✅ Updated index.html with nonces.');

// 5. Generate _headers with CSP ONLY (other headers in netlify.toml)
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.qrserver.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];

const cspHeader = cspDirectives.join('; ');

const headersContent = `/*
  Content-Security-Policy: ${cspHeader}
`;

fs.mkdirSync(path.dirname(headersPath), { recursive: true });
fs.writeFileSync(headersPath, headersContent);
console.log('✅ Generated _headers with dynamic CSP.');
