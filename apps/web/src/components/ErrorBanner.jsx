export default function ErrorBanner({ error, message: msg }) {
  const message = msg || (error && (error.message || error.error || JSON.stringify(error))) || "An error occurred";
  return (
    <div className="error-banner" role="alert">
      <strong style={{ marginRight: 8 }}>Error:</strong> {message}
    </div>
  );
}
