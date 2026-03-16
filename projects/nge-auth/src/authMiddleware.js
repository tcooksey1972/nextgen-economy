/**
 * @file authMiddleware.js
 * @description Extracts tenant context from Cognito JWT claims in API Gateway events.
 *
 * When API Gateway is configured with a Cognito authorizer, the JWT claims
 * are available in event.requestContext.authorizer.jwt.claims. This middleware
 * extracts the tenantId and user info so Lambda handlers can enforce
 * tenant-scoped data access.
 *
 * Usage in a Lambda handler:
 *
 *   const { extractTenantContext, requireAuth } = require("nge-auth/src/authMiddleware");
 *
 *   exports.handler = async (event) => {
 *     const auth = requireAuth(event);
 *     if (auth.error) return auth.error; // 401 response
 *
 *     const { tenantId, email, role } = auth;
 *     // Use tenantId to scope all DynamoDB queries
 *   };
 */

/**
 * Extracts tenant context from an API Gateway v2 event with JWT authorizer.
 *
 * @param {Object} event - API Gateway HTTP API event (payload format 2.0)
 * @returns {Object} { tenantId, email, role, sub, authenticated }
 */
function extractTenantContext(event) {
  const claims =
    event.requestContext?.authorizer?.jwt?.claims ||
    event.requestContext?.authorizer?.claims ||
    {};

  const tenantId = claims["custom:tenantId"] || null;
  const email = claims.email || null;
  const role = claims["custom:role"] || "viewer";
  const sub = claims.sub || null;

  return {
    tenantId,
    email,
    role,
    sub,
    authenticated: !!(tenantId && sub),
  };
}

/**
 * Requires authentication and returns tenant context or a 401 error response.
 *
 * @param {Object} event - API Gateway event
 * @returns {Object} { tenantId, email, role, sub } or { error: response }
 */
function requireAuth(event) {
  const ctx = extractTenantContext(event);

  if (!ctx.authenticated) {
    return {
      error: {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Unauthorized. Sign in required." }),
      },
    };
  }

  return ctx;
}

/**
 * Requires admin role within the tenant.
 *
 * @param {Object} event - API Gateway event
 * @returns {Object} { tenantId, email, role, sub } or { error: response }
 */
function requireAdmin(event) {
  const ctx = requireAuth(event);
  if (ctx.error) return ctx;

  if (ctx.role !== "admin") {
    return {
      error: {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Admin access required." }),
      },
    };
  }

  return ctx;
}

module.exports = { extractTenantContext, requireAuth, requireAdmin };
