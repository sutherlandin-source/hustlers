import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, registerAuthCallbacks } from "../services/api.js";

const STORAGE_KEY = "@hustlers_mobile_auth";

const AuthContext = createContext(null);

function resolveRole(user) {
  const candidates = [user?.role, user?.userRole, user?.accountType, user?.userType, user?.type]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (candidates.includes("admin")) return "admin";
  if (candidates.includes("manager")) return "manager";
  if (candidates.includes("hustler")) return "hustler";
  if (candidates.includes("both")) return "both";
  return "member";
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    role: resolveRole(user),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    registerAuthCallbacks({
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      setAuth: ({ user: nextUser, accessToken: nextAccessToken, refreshToken: nextRefreshToken }) => {
        if (nextUser !== undefined) setUser(normalizeUser(nextUser));
        if (nextAccessToken !== undefined) setAccessToken(nextAccessToken);
        if (nextRefreshToken !== undefined) setRefreshToken(nextRefreshToken);
      },
      logout,
    });
  }, [accessToken, refreshToken]);

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored || !mounted) return;

        const parsed = JSON.parse(stored);
        if (parsed?.accessToken) {
          setUser(normalizeUser(parsed.user || null));
          setAccessToken(parsed.accessToken || null);
          setRefreshToken(parsed.refreshToken || null);

          try {
            const profile = await apiRequest("/auth/me", { token: parsed.accessToken });
            if (mounted && profile?.user) {
              setUser(normalizeUser(profile.user));
            }
          } catch (err) {
            if (err?.response?.status === 401 && mounted) {
              logout();
            }
          }
        }
      } catch {
        // ignore malformed stored auth
      } finally {
        if (mounted) setHydrating(false);
      }
    };

    restore();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async ({ email, password }) => {
    setAuthLoading(true);
    try {
      const payload = await apiRequest("/auth/login", {
        method: "POST",
        body: { email, password },
      });

      const nextUser = payload?.user || payload?.data?.user || null;
      const nextAccessToken = payload?.accessToken || payload?.data?.accessToken || null;
      const nextRefreshToken = payload?.refreshToken || payload?.data?.refreshToken || null;

      setUser(normalizeUser(nextUser));
      setAccessToken(nextAccessToken);
      setRefreshToken(nextRefreshToken);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: nextUser, accessToken: nextAccessToken, refreshToken: nextRefreshToken })
      );

      return nextUser;
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async (payload) => {
    setAuthLoading(true);
    try {
      const response = await apiRequest("/auth/register", {
        method: "POST",
        body: payload,
      });

      const nextUser = response?.user || response?.data?.user || null;
      const nextAccessToken = response?.accessToken || response?.data?.accessToken || null;
      const nextRefreshToken = response?.refreshToken || response?.data?.refreshToken || null;

      setUser(normalizeUser(nextUser));
      setAccessToken(nextAccessToken);
      setRefreshToken(nextRefreshToken);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: nextUser, accessToken: nextAccessToken, refreshToken: nextRefreshToken })
      );

      return nextUser;
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  const value = useMemo(
    () => ({
      user,
      role: resolveRole(user),
      accessToken,
      refreshToken,
      authLoading,
      hydrating,
      login,
      register,
      logout,
      setUser,
      setAccessToken,
      setRefreshToken,
    }),
    [user, accessToken, refreshToken, authLoading, hydrating, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
