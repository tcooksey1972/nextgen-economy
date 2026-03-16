import { useState, useCallback, useEffect } from "react";
import config from "../utils/config";

/**
 * @hook useAuth
 * @description Manages Cognito authentication state: sign-up, sign-in, sign-out,
 *              confirmation, and JWT token retrieval.
 *
 * Uses the Cognito User Pool directly via the InitiateAuth / SignUp APIs
 * (no Amplify dependency). Tokens are stored in localStorage for persistence.
 *
 * When cognito.userPoolId or cognito.clientId are not configured, the hook
 * returns a no-op state so the rest of the app works without auth.
 */

const STORAGE_KEY = "nge_auth_tokens";
const { cognito } = config;
const enabled = !!(cognito.userPoolId && cognito.clientId);

// Cognito REST endpoint
const cognitoEndpoint = enabled
  ? `https://cognito-idp.${cognito.region}.amazonaws.com`
  : null;

async function cognitoRequest(action, payload) {
  const res = await fetch(cognitoEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || data.__type || "Auth request failed");
    err.code = data.__type;
    throw err;
  }
  return data;
}

function parseJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const tokens = JSON.parse(raw);
    // Check if ID token is expired
    const claims = parseJwt(tokens.idToken);
    if (!claims || claims.exp * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return tokens;
  } catch {
    return null;
  }
}

export default function useAuth() {
  const [user, setUser] = useState(null); // { email, tenantId, role, sub }
  const [tokens, setTokens] = useState(null); // { idToken, accessToken, refreshToken }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  // Extract user info from ID token
  const setSession = useCallback((authTokens) => {
    const claims = parseJwt(authTokens.idToken);
    if (!claims) return;
    setTokens(authTokens);
    setUser({
      email: claims.email,
      tenantId: claims["custom:tenantId"] || null,
      tenantName: claims["custom:tenantName"] || null,
      role: claims["custom:role"] || "viewer",
      sub: claims.sub,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authTokens));
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (!enabled) return;
    const stored = loadStoredTokens();
    if (stored) setSession(stored);
  }, [setSession]);

  const signUp = useCallback(async (email, password) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      await cognitoRequest("SignUp", {
        ClientId: cognito.clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }],
      });
      setNeedsConfirmation(true);
      setPendingEmail(email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmSignUp = useCallback(async (email, code) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      await cognitoRequest("ConfirmSignUp", {
        ClientId: cognito.clientId,
        Username: email,
        ConfirmationCode: code,
      });
      setNeedsConfirmation(false);
      setPendingEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await cognitoRequest("InitiateAuth", {
        AuthFlow: "USER_SRP_AUTH",
        ClientId: cognito.clientId,
        AuthParameters: {
          USERNAME: email,
          // SRP auth requires a challenge flow; fall back to USER_PASSWORD_AUTH
          // if the pool allows it — which our pool does (ALLOW_USER_SRP_AUTH).
        },
      });
      // For simplicity with no SRP library, use USER_PASSWORD_AUTH instead.
      // The pool must have ALLOW_USER_PASSWORD_AUTH enabled, or we use the
      // InitiateAuth with USER_PASSWORD_AUTH flow.
      const authResult = await cognitoRequest("InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: cognito.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });
      if (authResult.AuthenticationResult) {
        setSession({
          idToken: authResult.AuthenticationResult.IdToken,
          accessToken: authResult.AuthenticationResult.AccessToken,
          refreshToken: authResult.AuthenticationResult.RefreshToken,
        });
      }
    } catch (err) {
      if (err.code === "UserNotConfirmedException") {
        setNeedsConfirmation(true);
        setPendingEmail(email);
        setError("Please confirm your email first.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [setSession]);

  const signOut = useCallback(() => {
    setUser(null);
    setTokens(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    enabled,
    user,
    tokens,
    loading,
    error,
    needsConfirmation,
    pendingEmail,
    signUp,
    confirmSignUp,
    signIn,
    signOut,
    isAuthenticated: !!user,
  };
}
