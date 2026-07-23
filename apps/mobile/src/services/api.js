import Constants from "expo-constants";

function getExpoHost() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost || Constants.manifest?.debuggerHost || "";
  const host = String(hostUri).split(":")[0];
  return host || "";
}

function getDefaultApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  if (typeof window !== "undefined" && window?.location?.hostname) {
    return "http://localhost:5000/api/v1";
  }

  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:5000/api/v1`;
  }

  return "http://10.0.2.2:5000/api/v1";
}

const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();

let authCallbacks = {
  getAccessToken: null,
  getRefreshToken: null,
  setAuth: null,
  logout: null,
};

export function registerAuthCallbacks(callbacks) {
  authCallbacks = { ...authCallbacks, ...callbacks };
}

function buildQueryString(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export async function apiRequest(path, { method = "GET", token = null, body = null, query = {} } = {}) {
  const requestToken = token || (authCallbacks.getAccessToken ? authCallbacks.getAccessToken() : null);

  const requestOnce = async (bearerToken) => {
    const response = await fetch(`${DEFAULT_API_BASE_URL}${path}${buildQueryString(query)}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  const firstAttempt = await requestOnce(requestToken);
  if (firstAttempt.response.ok) {
    return firstAttempt.payload?.data ?? firstAttempt.payload;
  }

  if (firstAttempt.response.status === 401 && authCallbacks.getRefreshToken && authCallbacks.setAuth) {
    const refreshToken = authCallbacks.getRefreshToken();
    if (refreshToken) {
      try {
        const refreshResult = await fetch(`${DEFAULT_API_BASE_URL}/auth/refresh-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const refreshPayload = await refreshResult.json().catch(() => ({}));
        if (refreshResult.ok) {
          const refreshData = refreshPayload?.data || refreshPayload || {};
          const nextAccessToken = refreshData.accessToken;
          const nextRefreshToken = refreshData.refreshToken || refreshToken;
          const nextUser = refreshData.user || null;

          if (nextAccessToken) {
            authCallbacks.setAuth({
              user: nextUser,
              accessToken: nextAccessToken,
              refreshToken: nextRefreshToken,
            });

            const retry = await requestOnce(nextAccessToken);
            if (retry.response.ok) {
              return retry.payload?.data ?? retry.payload;
            }
            const retryError = new Error(retry.payload?.message || "Request failed");
            retryError.response = { status: retry.response.status, data: retry.payload };
            throw retryError;
          }
        }
      } catch (refreshError) {
        if (authCallbacks.logout) authCallbacks.logout();
        throw refreshError;
      }
    }
  }

  const error = new Error(firstAttempt.payload?.message || "Request failed");
  error.response = { status: firstAttempt.response.status, data: firstAttempt.payload };
  throw error;
}
