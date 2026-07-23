import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { conversationsService } from "../../services/conversationsService.js";
import { messagesService } from "../../services/messagesService.js";
import { createChatSocket, disconnectChatSocket } from "../../utils/socket.js";
import Loader from "../../components/Loader.jsx";
import { IconPaperclip } from "../../components/Icons.jsx";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export default function ChatPage() {
  const { conversationId } = useParams();
  const { accessToken, user } = useAuth();
  const location = useLocation();
  const messageListRef = useRef(null);
  const fileInputRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    async function loadMessages() {
      setLoading(true);
      setError("");
      try {
        await conversationsService.getConversation(conversationId).catch(() => null);
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
    if (location?.state?.messageId) return;
    const list = messageListRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, location?.state?.messageId]);

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
    if (!text.trim() && attachments.length === 0) return;

    setSending(true);
    setError("");

    try {
      await messagesService.create(conversationId, text.trim(), attachments);
      setText("");
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const currentUserId = user?._id || user?.id || user?.userId;

  function senderIdOf(message) {
    return message.senderId?._id || message.senderId?.id || message.senderId;
  }

  function senderNameOf(message) {
    const sender = message.senderId;
    if (!sender || typeof sender === "string") return "Unknown";
    const fullName = [sender.firstName, sender.lastName].filter(Boolean).join(" ");
    return fullName || sender.email || "Unknown";
  }

  function senderInitials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      event.target.value = "";
      return;
    }

    try {
      const nextAttachments = await Promise.all(files.map(fileToAttachment));
      setAttachments((current) => [...current, ...nextAttachments]);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to attach file.");
    } finally {
      event.target.value = "";
    }
  }

  function removeAttachment(index) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <section className="page-section chat-page">
      <header className="page-header chat-page-header">
        <div>
          <h2>Conversation</h2>
          <p>{messages.length ? `${messages.length} message${messages.length === 1 ? "" : "s"}` : "Start the conversation"}</p>
        </div>
      </header>

      {loading ? (
        <Loader label="Loading messages..." />
      ) : (
        <div className="chat-container">
          {error && <div className="error-banner">{error}</div>}

          <div className="message-list" ref={messageListRef}>
            {messages.length === 0 ? (
              <div className="empty-state">No messages yet. Send the first message.</div>
            ) : (
              messages.map((message) => {
                const senderName = senderNameOf(message);
                const isMine = String(senderIdOf(message)) === String(currentUserId);

                return (
                  <div
                    id={`message-${message._id || message.id}`}
                    key={message.id || message._id}
                    className={`message-item ${isMine ? "message-item-own" : "message-item-other"}`}
                  >
                    {!isMine && <div className="message-avatar" aria-hidden>{senderInitials(senderName)}</div>}
                    <div className="message-bubble">
                      <div className="message-header">
                        <strong>{isMine ? "You" : senderName}</strong>
                        <span>{new Date(message.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                      </div>
                      <div className="message-body">{message.text}</div>
                      {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <div className="message-attachments">
                          {message.attachments.map((attachment, index) => (
                            <a
                              key={`${attachment.name}-${index}`}
                              className="message-attachment"
                              href={attachment.dataUrl}
                              download={attachment.name}
                            >
                              <span>{attachment.name}</span>
                              <small>{formatFileSize(attachment.size)}</small>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {isMine && <div className="message-avatar message-avatar-own" aria-hidden>{senderInitials(user?.firstName || user?.email || "You")}</div>}
                  </div>
                );
              })
            )}
          </div>

          <form className="chat-input-row" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
            <div className="chat-composer-main">
              {attachments.length > 0 && (
                <div className="chat-attachment-preview">
                  {attachments.map((attachment, index) => (
                    <div className="chat-attachment-chip" key={`${attachment.name}-${index}`}>
                      <span>{attachment.name}</span>
                      <small>{formatFileSize(attachment.size)}</small>
                      <button type="button" onClick={() => removeAttachment(index)} aria-label={`Remove ${attachment.name}`}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                className="chat-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Type your message..."
                rows={3}
              />
            </div>
            <div className="chat-composer-actions">
              <button
                type="button"
                className="chat-attach-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach files"
                title="Attach files"
              >
                <IconPaperclip className="button-icon" />
              </button>
              <input
                ref={fileInputRef}
                className="chat-file-input"
                type="file"
                multiple
                onChange={handleAttachmentChange}
              />
            </div>
            <button type="submit" className="button-primary" disabled={sending || (!text.trim() && attachments.length === 0)}>
              {sending ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function fileToAttachment(file) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Promise.reject(new Error("Attachment must be 5MB or smaller."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result || ""),
      });
    };
    reader.onerror = () => reject(new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size = 0) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
