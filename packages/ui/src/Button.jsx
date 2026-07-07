export function Button({ label, onPress }) {
  return (
    <button type="button" onClick={onPress} style={{
      padding: "0.8rem 1.2rem",
      borderRadius: "999px",
      border: "none",
      background: "#2563eb",
      color: "white",
      cursor: "pointer"
    }}>
      {label}
    </button>
  );
}

