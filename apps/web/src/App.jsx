import { Suspense } from "react";
import { useRoutes, Navigate } from "react-router-dom";
import { publicRoutes, protectedRoutes } from "./routes/routes.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  const routes = [
    ...publicRoutes,
    ...protectedRoutes,
    { path: "*", element: <Navigate to="/" replace /> },
  ];

  const routing = useRoutes(routes);

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="page-shell">Loading...</div>}>{routing}</Suspense>
      <Toast />
    </div>
  );
}

