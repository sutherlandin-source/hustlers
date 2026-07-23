import { Link, useLocation } from "react-router-dom";

function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value || "").trim());
}

export default function ProfileCompletionCard({ user }) {
  const location = useLocation();
  const basePath = location.pathname.startsWith("/manager") ? "/manager" : "/dashboard";

  const items = [
    {
      key: "profile",
      label: "Profile",
      done: isFilled(user?.firstName) && isFilled(user?.lastName) && isFilled(user?.location),
      href: `${basePath}/profile`,
      helper: "Name and location",
    },
    {
      key: "kyc",
      label: "KYC",
      done: isFilled(user?.idNumber) && isFilled(user?.mpesaNumber),
      href: `${basePath}/profile`,
      helper: "ID and M-Pesa",
    },
    {
      key: "skills",
      label: "Skills",
      done: isFilled(user?.skills),
      href: `${basePath}/profile`,
      helper: "What you offer",
    },
    {
      key: "photo",
      label: "Profile Photo",
      done: isFilled(user?.avatar),
      href: `${basePath}/profile`,
      helper: "Add a face to the name",
    },
  ];

  const completedCount = items.filter((item) => item.done).length;
  const completionPercentage = Math.round((completedCount / items.length) * 100);

  return (
    <section className="card" style={{ borderRadius: 20, padding: "1.25rem", background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", marginBottom: "1rem" }}>
        <div>
          <p style={{ margin: 0, color: "#2563eb", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Get set up
          </p>
          <h3 style={{ margin: "0.25rem 0 0.35rem" }}>Profile completion</h3>
          <p style={{ margin: 0, color: "#4b5563" }}>A few quick details help people trust your account.</p>
        </div>
        <div style={{ minWidth: 88, textAlign: "right" }}>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, lineHeight: 1 }}>{completionPercentage}%</div>
          <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>{completedCount}/{items.length} done</div>
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
          <div
            style={{
              width: `${completionPercentage}%`,
              height: "100%",
              borderRadius: 999,
              background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
              transition: "width 180ms ease",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.3rem",
              padding: "0.9rem",
              borderRadius: 16,
              border: item.done ? "1px solid #bbf7d0" : "1px solid #dbeafe",
              background: item.done ? "#f0fdf4" : "#eff6ff",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
              <strong>{item.label}</strong>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: item.done ? "#15803d" : "#1d4ed8" }}>
                {item.done ? "Done" : "Open"}
              </span>
            </div>
            <span style={{ color: "#4b5563", fontSize: "0.9rem" }}>{item.helper}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
