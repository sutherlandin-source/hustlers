export default function Loader({ size = 32, label = "Loading..." }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <svg viewBox="0 0 50 50" aria-hidden>
        <circle cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="31.4 31.4" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
