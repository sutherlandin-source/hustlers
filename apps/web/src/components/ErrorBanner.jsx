export default function ErrorBanner({ error, message: msg }) {
  let fallbackMessage = "An error occurred";

  if (error) {
    try {
      fallbackMessage = error.message || error.error || JSON.stringify(error);
    } catch {
      fallbackMessage = error.message || error.error || "An error occurred";
    }
  }

  const message = msg || fallbackMessage;
  return (
    <div className="error-banner" role="alert">
      <strong style={{ marginRight: 8 }}>Error:</strong> {message}
    </div>
  );
}
