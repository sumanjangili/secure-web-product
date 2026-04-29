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

// 2. Inject nonce into ALL script tags
html = html.replace(
  /(<script[^>]*)(src="[^"]*"[^>]*)(>)/g,
  (match, before, srcAttr, after) => {
    if (match.includes('nonce=')) return match;
    return `${before} nonce="${nonce}"${srcAttr}${after}`;
  }
);

// 3. Update the CSP meta tag content
html = html.replace(
  /'nonce-PLACEHOLDER'/g,
  `'nonce-${nonce}'`
);

// 4. Write the modified HTML back
fs.writeFileSync(indexPath, html);
console.log('✅ Updated index.html with nonce.');

// 5. Generate the _headers file for Netlify
// Using STRICT straight quotes (')
const cspHeader = `default-src 'self'; 
script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; 
style-src 'self' 'unsafe-inline'; 
img-src 'self' data: blob:; 
font-src 'self'; 
connect-src 'self' https://api.qrserver.com; 
frame-ancestors 'none'; 
base-uri 'self'; 
form-action 'self'`;

const headersContent = `
/*
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
console.log(`✅ Generated _headers file with CSP.`);
console.log(`📋 CSP Header: ${cspHeader}`);
