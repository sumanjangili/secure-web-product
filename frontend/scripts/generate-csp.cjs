// frontend/scripts/generate-csp.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
const headersPath = path.join(distPath, '_headers');

// 1. Generate a random nonce (base64 encoded)
const nonceBuffer = crypto.randomBytes(16);
const nonce = nonceBuffer.toString('base64');
console.log(`[SECURITY] Generated Nonce: ${nonce}`);

if (!fs.existsSync(indexPath)) {
  console.error('❌ Error: index.html not found in dist folder. Run "npm run build" first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf-8');

// 2. Inject nonce into ALL script tags
html = html.replace(
  /(<script[^>]*)(\s+src="[^"]*")?([^>]*>)/g,
  (match, before, srcAttr, after) => {
    if (match.includes('nonce=')) return match;
    const nonceAttr = ` nonce="${nonce}"`;
    return `${before}${nonceAttr}${srcAttr || ''}${after}`;
  }
);

// 3. Update the CSP meta tag content (if you have a placeholder in index.html)
html = html.replace(
  /'nonce-PLACEHOLDER'/g,
  `'nonce-${nonce}'`
);

// 4. Write the modified HTML back
fs.writeFileSync(indexPath, html);
console.log('✅ Updated index.html with nonce.');

// 5. Generate the _headers file for Netlify
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.qrserver.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
];

const cspHeader = cspDirectives.join('; ');

const headersContent = `/*
  Content-Security-Policy: ${cspHeader}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
`;

// Create dist folder if it doesn't exist
if (!fs.existsSync(path.dirname(headersPath))) {
  fs.mkdirSync(path.dirname(headersPath), { recursive: true });
}

fs.writeFileSync(headersPath, headersContent);
console.log('✅ Generated _headers file with CSP.');
console.log(`📋 CSP Header Length: ${cspHeader.length} chars`);
