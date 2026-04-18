// netlify/functions/hello.js

/**
 * Simple health check / greeting endpoint.
 * Useful for verifying Netlify Functions deployment is working.
 * 
 * SECURITY NOTES:
 * - No secrets or sensitive data exposed
 * - No authentication required (public endpoint)
 * - Safe for production use
 */

exports.handler = async (event, context) => {
  // -------------------------------------------------
  // Enforce GET method (optional, but good practice)
  // -------------------------------------------------
  if (event.httpMethod !== 'GET') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  // -------------------------------------------------
  // Health check response
  // -------------------------------------------------
  return {
    statusCode: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify({
      message: '👋 Hello from Netlify!',
      timestamp: new Date().toISOString(),
      environment: process.env.CONTEXT || 'production',
      function: 'hello'
    })
  };
};
