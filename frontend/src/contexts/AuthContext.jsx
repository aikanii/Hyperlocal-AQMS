/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode the JWT payload without verifying the signature.
 * Returns null if the token is missing, malformed, or expired.
 */
const decodeToken = (token) => {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Reject if expired
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem('aqms_token');
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [payload, setPayload] = useState(() =>
    decodeToken(localStorage.getItem('aqms_token'))
  );

  /** Call this after a successful /api/auth/login to persist the token. */
  const login = useCallback((token) => {
    localStorage.setItem('aqms_token', token);
    setPayload(decodeToken(token));
  }, []);

  /** Clear session. */
  const logout = useCallback(() => {
    localStorage.removeItem('aqms_token');
    setPayload(null);
  }, []);

  const isLoggedIn = payload !== null;
  const isAdmin    = isLoggedIn && payload?.role === 'admin';
  const username   = payload?.username ?? null;

  return (
    <AuthContext.Provider value={{ isLoggedIn, isAdmin, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

/** Convenience hook — throws if used outside the provider. */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
