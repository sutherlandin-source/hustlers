import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { registerAuthCallbacks } from "../services/api.js";
import { authService } from "../services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Initialize user from localStorage synchronously
    try {
      const saved = localStorage.getItem("hustlers_auth");
      return saved ? JSON.parse(saved).user || null : null;
    } catch {
      return null;
    }
  });

  const [accessToken, setAccessToken] = useState(() => {
    // Initialize accessToken from localStorage synchronously
    try {
      const saved = localStorage.getItem("hustlers_auth");
      return saved ? JSON.parse(saved).accessToken || null : null;
    } catch {
      return null;
    }
  });

  const [refreshToken, setRefreshToken] = useState(() => {
    // Initialize refreshToken from localStorage synchronously
    try {
      const saved = localStorage.getItem("hustlers_auth");
      return saved ? JSON.parse(saved).refreshToken || null : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  // Persist auth to localStorage
  useEffect(() => {
    localStorage.setItem("hustlers_auth", JSON.stringify({ user, accessToken, refreshToken }));
  }, [user, accessToken, refreshToken]);

  const setAuth = useCallback(({ user: nextUser, accessToken: nextAccessToken, refreshToken: nextRefreshToken }) => {
    setUser(nextUser);
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
  }, []);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    setAuth(result);
    return result;
  }, [setAuth]);

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await authService.logout();
      }
    } catch (error) {
      // ignore logout errors, clear local auth anyway
    }
    setAuth({ user: null, accessToken: null, refreshToken: null });
    localStorage.removeItem("hustlers_auth");
  }, [accessToken, setAuth]);

  const register = useCallback(async (payload) => {
    const result = await authService.register(payload);
    setAuth(result);
    return result;
  }, [setAuth]);

  // Register callbacks with API interceptor on mount
  useEffect(() => {
    registerAuthCallbacks({
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      setAuth,
      logout,
    });
  }, [accessToken, refreshToken, setAuth, logout]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      loading,
      isAuthenticated: Boolean(user && accessToken),
      login,
      logout,
      register,
      updateUser,
    }),
    [user, accessToken, refreshToken, loading, login, logout, register, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}


