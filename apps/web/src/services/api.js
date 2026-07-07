import axios from "axios";

/**
 * CENTRALIZED AXIOS SETUP WITH JWT AUTH INTERCEPTORS
 *
 * Architecture Overview:
 * - Single axios instance with automatic JWT token injection
 * - Request interceptor: injects Bearer token from auth state
 * - Response interceptor: handles 401 errors with automatic token refresh
 * - Token refresh flow: retries failed requests after refresh
 * - Logout on refresh failure: clears auth state and redirects to login
 *
 * Token Persistence:
 * - Access tokens: injected via interceptor, stored in React state
 * - Refresh tokens: stored in localStorage for cross-session persistence
 * - Auth state: localStorage key 'hustlers_auth' { user, accessToken, refreshToken }
 *
 * Error Handling:
 * - 401 Unauthorized: triggers token refresh with request queue
 * - Refresh failure: automatic logout with error propagation
 * - Network errors: passed through without retry
 * - Concurrent requests during refresh: queued and resolved with new token
 *
 * Usage:
 * 1. AuthContext registers callbacks via registerAuthCallbacks() on mount
 * 2. Request interceptor injects token automatically
 * 3. Response interceptor handles 401 with refresh + retry
 * 4. Services call axiosInstance (token/refresh handled automatically)
 * 5. Components fetch via services/data store (no direct axios calls)
 */

// Auth state registry: allows interceptors to access auth methods
let authCallbacks = {
  getAccessToken: null,
  getRefreshToken: null,
  setAuth: null,
  logout: null,
};

export function registerAuthCallbacks(callbacks) {
  authCallbacks = { ...authCallbacks, ...callbacks };
}

// Axios instance with base config
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request queue for handling concurrent refresh requests
let isRefreshing = false;
let requestQueue = [];

const processQueue = (token, error = null) => {
  requestQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  requestQueue = [];
};

// Request interceptor: inject JWT token
axiosInstance.interceptors.request.use(
  (config) => {
    const url = config.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh-token") ||
      url.includes("/auth/password") ||
      url.includes("/auth/otp");

    if (isAuthEndpoint) {
      return config;
    }

    const token = authCallbacks.getAccessToken ? authCallbacks.getAccessToken() : null;
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401, refresh token, retry
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip retry if no config or already retried
    if (!originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest.url || "";
    const isAuthEndpoint =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/refresh-token") ||
      requestUrl.includes("/auth/password") ||
      requestUrl.includes("/auth/otp");

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    // Only retry on 401 with valid refresh token
    const status = error.response?.status;
    const refreshToken = authCallbacks.getRefreshToken ? authCallbacks.getRefreshToken() : null;
    if (status !== 401 || !refreshToken) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Wait for ongoing refresh to complete
      return new Promise((resolve, reject) => {
        requestQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return axiosInstance(originalRequest);
        })
        .catch(Promise.reject);
    }

    // Start refresh flow
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await axiosInstance.post("/auth/refresh-token", { refreshToken });
      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = response.data.data;

      // Update auth state
      if (authCallbacks.setAuth) {
        authCallbacks.setAuth({
          user,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      }

      // Process queued requests with new token
      processQueue(newAccessToken);

      // Retry original request
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      // Refresh failed: logout user
      processQueue(null, refreshError);
      if (authCallbacks.logout) {
        authCallbacks.logout();
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// Error formatter
export function handleApiError(error) {
  if (error.response) {
    return error.response.data || { message: error.message };
  }
  return { message: error.message };
}
