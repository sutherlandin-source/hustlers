import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { apiRequest } from "../services/api.js";
import { useAuth } from "../context/AuthContext.js";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Polls /notifications/unread-count every 30 seconds.
 * Returns { count, refresh } where:
 *   - count: number of unread notifications (0 when loading or on error)
 *   - refresh: call to manually trigger a refresh (e.g. after marking read)
 *
 * Pauses polling while the app is in the background.
 */
export function useUnreadNotifications() {
  const { accessToken } = useAuth();
  const [count, setCount] = useState(0);
  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const fetchCount = useCallback(async () => {
    if (!accessToken) return;
    try {
      const payload = await apiRequest("/notifications/unread-count", { token: accessToken });
      const value = Number(
        payload?.count ??
        payload?.data?.count ??
        0
      );
      setCount(isNaN(value) ? 0 : value);
    } catch {
      // Silently swallow — don't show errors for background polls
    }
  }, [accessToken]);

  // Start / stop polling based on accessToken and app state
  useEffect(() => {
    if (!accessToken) {
      setCount(0);
      return;
    }

    // Fetch immediately on mount / token change
    fetchCount();

    // Poll on interval
    intervalRef.current = setInterval(() => {
      if (appStateRef.current === "active") {
        fetchCount();
      }
    }, POLL_INTERVAL_MS);

    // Pause when app goes to background, resume when active
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState === "active") {
        // Fetch immediately when coming back into foreground
        fetchCount();
      }
    });

    return () => {
      clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [accessToken, fetchCount]);

  return { count, refresh: fetchCount };
}
