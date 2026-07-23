import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { userService } from "../../services/userService.js";
import Loader from "../../components/Loader.jsx";
import { getAppEntryTarget } from "../../utils/appEntry.js";

export default function AppEntryPage() {
  const location = useLocation();
  const { isAuthenticated, user, updateUser } = useAuth();
  const [resolvedUser, setResolvedUser] = useState(user);
  const [loading, setLoading] = useState(() => isAuthenticated && !user);

  const pendingRoleChoice = (() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem("hustlers_pending_role_choice") === "true";
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    const resolveUser = async () => {
      if (!isAuthenticated) {
        setResolvedUser(null);
        setLoading(false);
        return;
      }

      if (user) {
        setResolvedUser(user);
        setLoading(false);
        return;
      }

      setLoading(true);

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out loading account"));
        }, 4000);
      });

      try {
        const profile = await Promise.race([userService.getProfile(), timeoutPromise]);
        const nextUser = profile?.user || profile;
        if (!cancelled && nextUser) {
          setResolvedUser(nextUser);
          updateUser(nextUser);
        }
      } catch {
        if (!cancelled) {
          setResolvedUser(user);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }
    };

    resolveUser();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isAuthenticated, updateUser, user]);

  const target = useMemo(
    () => getAppEntryTarget(resolvedUser || user, { pendingRoleChoice }),
    [resolvedUser, user, pendingRoleChoice]
  );

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }

  if (loading) {
    return (
      <section className="page-shell">
        <Loader label="Loading your account..." />
      </section>
    );
  }

  return <Navigate to={target} replace />;
}
