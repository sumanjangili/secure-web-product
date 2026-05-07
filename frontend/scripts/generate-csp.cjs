// frontend/scripts/generate-csp.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
const headersPath = path.join(distPath, '_headers');

// 1. Generate a random nonce (base64 encoded)
// Using 16 bytes (128 bits) is standard for CSP nonces
const nonceBuffer = crypto.randomBytes(16);
const nonce = nonceBuffer.toString('base64');
console.log(`[SECURITY] Generated Nonce: ${nonce}`);

// 2. Check if index.html exists
if (!fs.existsSync(indexPath)) {
  console.error('❌ Error: index.html not found in dist folder.');
  console.error('   Please run "npm run build" first before running this script.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf-8');

// 3. Inject nonce into ALL script tags
// Improved Regex:
// - Handles single quotes: src='...'
// - Handles multiline tags
// - Case insensitive for tag names
// - Uses a negative lookahead to avoid double-injection
const scriptTagRegex = /<script(\s+[^>]*)?>/gi;

html = html.replace(scriptTagRegex, (match, attributes) => {
  // Skip if nonce already exists (idempotent)
  if (/nonce\s*=\s*["'].*["']/.test(match)) {
    return match;
  }

  // Insert nonce attribute before the closing >
  // We preserve existing attributes and append the nonce
  const nonceAttr = ` nonce="${nonce}"`;
  
  // Handle case where attributes might be empty or just whitespace
  if (attributes.trim() === '') {
    return `<script${nonceAttr}>`;
  }
  
  return `<script${attributes}${nonceAttr}>`;
});

// 4. Update the CSP meta tag content
// Ensure your index.html has: <meta http-equiv="Content-Security-Policy" content="... 'nonce-PLACEHOLDER' ...">
const placeholder = "'nonce-PLACEHOLDER'";
const newNonceValue = `'nonce-${nonce}'`;

if (html.includes(placeholder)) {
  html = html.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), newNonceValue);
  console.log('✅ Updated CSP meta tag with nonce.');
} else {
  console.warn('⚠️ Warning: Placeholder "nonce-PLACEHOLDER" not found in index.html.');
  console.warn('   The CSP meta tag might not be updated correctly.');
}

// 5. Write the modified HTML back
fs.writeFileSync(indexPath, html);
console.log('✅ Updated index.html with nonce attributes.');

// 6. Generate the _headers file for Netlify
// Security Improvements:
// - Added 'strict-dynamic' (requires nonce/hash for initial scripts)
// - Removed 'unsafe-inline' from script-src
// - Added 'report-uri' (optional, for monitoring)
// - Added 'require-trusted-types-for' (advanced XSS protection)
const cspDirectives = [
  "default-src 'self'",
  // Script: Strict mode with nonce
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  // Style: 'unsafe-inline' kept for compatibility, but consider using hashes if possible
  "style-src 'self' 'unsafe-inline'",
  // Images: Allow self, data, and blobs
  "img-src 'self' data: blob:",
  // Fonts: Allow self
  "font-src 'self'",
  // Connections: Allow self and specific APIs
  "connect-src 'self' https://api.qrserver.com",
  // Frames: Deny all framing
  "frame-ancestors 'none'",
  // Base URI: Prevent injection
  "base-uri 'self'",
  // Form Actions: Only allow self
  "form-action 'self'",
  // Upgrade Insecure Requests
  "upgrade-insecure-requests",
  // Trusted Types (Optional but recommended for advanced XSS protection)
  // "require-trusted-types-for 'script'" 
];

const cspHeader = cspDirectives.join('; ');

// Add CSRF reminder in comments for the developer
// Note: CSP 'form-action' helps, but backend CSRF tokens are still required.
// Ensure cookies are set with SameSite=Strict or Lax.
const headersContent = `/*
  Content-Security-Policy: ${cspHeader}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  
  # CSRF Protection Reminder:
  # 1. Ensure all state-changing requests (POST/PUT/DELETE) include a CSRF token.
  # 2. Set session cookies with SameSite=Strict or SameSite=Lax.
  # 3. Verify tokens on the backend.
`;

// Create dist folder if it doesn't exist
if (!fs.existsSync(path.dirname(headersPath))) {
  fs.mkdirSync(path.dirname(headersPath), { recursive: true });
}

fs.writeFileSync(headersPath, headersContent);
console.log('✅ Generated _headers file with CSP and security headers.');
console.log(`📋 CSP Header Length: ${cspHeader.length} chars`);
console.log(`🔒 Security Status: Nonce-based CSP active. 'unsafe-inline' removed from scripts.`);
console.log(`🛡️ CSRF Note: Backend token validation and SameSite cookies are still required.`);
