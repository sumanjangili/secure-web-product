// frontend/scripts/generate-csp.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
const headersPath = path.join(distPath, '_headers');

// 1. Generate a random nonce (base64 encoded)
const nonce = crypto.randomBytes(16).toString('base64');
console.log(`🔐 Generated Nonce: ${nonce}`);

if (!fs.existsSync(indexPath)) {
  console.error('❌ Error: index.html not found in dist folder. Run "npm run build" first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf-8');

// 2. Inject nonce into ALL script tags (not just type="module")
// This handles Vite's chunk splitting which may create multiple script tags
html = html.replace(
  /(<script[^>]*)(src="[^"]*"[^>]*)(>)/g,
  (match, before, srcAttr, after) => {
    // Skip if nonce already exists
    if (match.includes('nonce=')) return match;
    return `${before} nonce="${nonce}"${srcAttr}${after}`;
  }
);

// 3. Update the CSP meta tag content - replace PLACEHOLDER with actual nonce
html = html.replace(
  /'nonce-PLACEHOLDER'/g,
  `'nonce-${nonce}'`
);

// 4. Write the modified HTML back
fs.writeFileSync(indexPath, html);
console.log('✅ Updated index.html with nonce.');

// 5. Generate the _headers file for Netlify
const cspHeader = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self'; img-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`;

const headersContent = `
/*
  Content-Security-Policy: ${cspHeader}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
`;

fs.writeFileSync(headersPath, headersContent);
console.log(`✅ Generated _headers file with CSP.`);
