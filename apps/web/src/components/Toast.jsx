import React from "react";
import useNotificationStore from "../state/useNotificationStore.js";

export default function Toast() {
  const { toasts, removeToast } = useNotificationStore();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toast-body">
            <strong style={{ display: "block", marginBottom: 4 }}>{t.type === "error" ? "Error" : t.type === "success" ? "Success" : "Notice"}</strong>
            <div style={{ fontSize: 13 }}>{t.message}</div>
          </div>
          <button onClick={() => removeToast(t.id)}>Close</button>
        </div>
      ))}
    </div>
  );
}
