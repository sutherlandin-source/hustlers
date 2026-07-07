import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { messagesService } from "../../services/messagesService.js";
import { createChatSocket, disconnectChatSocket } from "../../utils/socket.js";
import Loader from "../../components/Loader.jsx";

export default function ChatPage() {
  const { conversationId } = useParams();
  const { accessToken } = useAuth();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    async function loadMessages() {
      setLoading(true);
      setError("");
      try {
        const response = await messagesService.list(conversationId);
        setMessages(response);
      } catch (err) {
        setError(err?.message || "Failed to load messages.");
      } finally {
        setLoading(false);
      }
    }

    if (conversationId) {
      loadMessages();
    }
  }, [conversationId]);

  // Scroll to a specific message if navigated with state.messageId
  useEffect(() => {
    if (!location?.state?.messageId) return;
    const id = location.state.messageId;
    // wait a tick for messages to render
    const t = setTimeout(() => {
      const el = document.getElementById(`message-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("highlight-message");
        setTimeout(() => el.classList.remove("highlight-message"), 3000);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [location?.state?.messageId, messages]);

  useEffect(() => {
    if (!conversationId || !accessToken) return;

    const socket = createChatSocket(accessToken);

    if (!socket) return;

    socket.connect();
    socket.emit("join_conversation", { conversationId });

    const handleReceiveMessage = (message) => {
      setMessages((current) => [...current, message]);
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("receive_error", (message) => {
      setError(message);
    });

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("receive_error");
      disconnectChatSocket();
    };
  }, [conversationId, accessToken]);

  const handleSend = async () => {
    if (!text.trim()) return;

    setSending(true);
    setError("");

    try {
      await messagesService.create(conversationId, text.trim());
      setText("");
    } catch (err) {
      setError(err?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="page-section chat-page">
      <header className="page-header">
        <div>
          <h2>Conversation</h2>
          <p>Messages are shown in chronological order.</p>
        </div>
      </header>

      {loading ? (
        <Loader label="Loading messages..." />
      ) : (
        <div className="chat-container">
          {error && <div className="error-banner">{error}</div>}

          <div className="message-list">
            {messages.length === 0 ? (
              <div className="empty-state">No messages yet. Send the first message.</div>
            ) : (
              messages.map((message) => (
                <div id={`message-${message._id || message.id}`} key={message.id || message._id} className="message-item">
                  <div className="message-header">
                    <strong>{message.senderId?.firstName || message.senderId?.email || "Unknown"}</strong>
                    <span>{new Date(message.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="message-body">{message.text}</div>
                </div>
              ))
            )}
          </div>

          <div className="chat-input-row">
            <textarea
              className="chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your message..."
              rows={3}
            />
            <button className="button-primary" onClick={handleSend} disabled={sending || !text.trim()}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
