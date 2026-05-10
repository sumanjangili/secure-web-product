// netlify/functions/hello.js

/**
 * Simple health check / greeting endpoint.
 * Useful for verifying Netlify Functions deployment is working.
 * 
 * SECURITY NOTES:
 * - Public endpoint (no auth required)
 * - Read-only (no state changes) -> No CSRF/Race Condition risk
 * - Sanitizes output to prevent accidental info leakage
 */

exports.handler = async (event, context) => {
  try {
    // -------------------------------------------------
    // 1. Enforce GET method
    // -------------------------------------------------
    if (event.httpMethod !== 'GET') {
      return { 
        statusCode: 405, 
        headers: { 
          'Content-Type': 'application/json',
          'Allow': 'GET',
          'X-Content-Type-Options': 'nosniff'
        },
        body: JSON.stringify({ error: 'Method Not Allowed' }) 
      };
    }

    // -------------------------------------------------
    // 2. Sanitize Environment Variables
    // -------------------------------------------------
    // Prevent leaking sensitive info or injecting malicious strings via env vars
    const safeEnv = (envVar) => {
      if (!envVar) return 'production';
      // Strip potential script tags or control characters
      return String(envVar).replace(/[<>"'\/\\]/g, '').substring(0, 20);
    };

    const safeNodeEnv = safeEnv(process.env.NODE_ENV);
    
    // -------------------------------------------------
    // 3. Health check response
    // -------------------------------------------------
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        // Prevent caching of health status (ensure fresh data)
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        
        // Security Headers
        'X-Content-Type-Options': 'nosniff', // Prevent MIME sniffing
        'X-Frame-Options': 'DENY',           // Prevent clickjacking (though JSON is safe)
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        
        // CORS: Allow any origin for health checks (monitoring tools)
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        message: '👋 Hello from Netlify!',
        timestamp: new Date().toISOString(),
        status: 'healthy',
        function: 'hello',
        environment: safeNodeEnv // ✅ Sanitized
      })
    };

  } catch (error) {
    console.error('[Hello] Health check failed:', error.message);
    // Do NOT expose stack trace or error details to the public
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ 
        error: 'Service temporarily unavailable',
        timestamp: new Date().toISOString()
      })
    };
  }
};
