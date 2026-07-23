import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { conversationsService } from "../../services/conversationsService.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

function formatConversationTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getParticipantName(participant) {
  if (!participant) return "Unknown";
  return [participant.firstName, participant.lastName].filter(Boolean).join(" ") || participant.email || "Unknown";
}

function getContractLabel(contract) {
  if (!contract) return "General chat";
  if (typeof contract === "string") return "Related contract";
  return contract.title || contract.contractNumber || "Related contract";
}

function getInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentBasePath = location.pathname.startsWith("/manager")
    ? "/manager"
    : location.pathname.startsWith("/admin")
      ? "/admin"
      : "/dashboard";

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadConversations = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await conversationsService.list();
        if (!mounted) return;
        setConversations(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load conversations.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadConversations();

    return () => {
      mounted = false;
    };
  }, []);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((left, right) => {
      const leftTime = new Date(left.lastMessage?.createdAt || left.updatedAt || 0).getTime();
      const rightTime = new Date(right.lastMessage?.createdAt || right.updatedAt || 0).getTime();
      return rightTime - leftTime;
    }).filter((conversation) => conversation.lastMessage);
  }, [conversations]);

  const handleOpen = (conversationId) => {
    navigate(`${currentBasePath}/chat/${conversationId}`);
  };

  if (loading) return <Loader label="Loading messages..." />;

  return (
    <section className="page-section messages-page">
      <header className="page-header">
        <div>
          <h2>Messages</h2>
          <p>Your conversations in one place.</p>
        </div>
      </header>

      {error && <ErrorBanner error={error} />}

      {!error && sortedConversations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">No messages</div>
          <h3>No conversations yet</h3>
          <p>When people message you, the conversation will appear here.</p>
        </div>
      ) : (
        <div className="messages-list">
          {sortedConversations.map((conversation) => {
            const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
            const otherParticipants = participants.filter((participant) => String(participant?._id || participant?.id) !== String(user?._id || user?.id));
            const primaryParticipant = otherParticipants[0] || participants[0] || {};
            const participantName =
              otherParticipants.length > 1
                ? otherParticipants.map(getParticipantName).join(", ")
                : getParticipantName(primaryParticipant);
            const participantAvatar = primaryParticipant.avatar;
            const lastMessage = conversation.lastMessage || {};
            const lastMessageText =
              lastMessage.text?.trim() ||
              (Array.isArray(lastMessage.attachments) && lastMessage.attachments.length > 0
                ? `${lastMessage.attachments.length} attachment${lastMessage.attachments.length === 1 ? "" : "s"}`
                : "No messages yet");
            const contractLabel = getContractLabel(conversation.contractId);

            return (
              <button
                key={conversation._id || conversation.id}
                type="button"
                className="message-thread-card"
                onClick={() => handleOpen(conversation._id || conversation.id)}
              >
                <div className="message-thread-avatar" aria-hidden>
                  {participantAvatar ? <img src={participantAvatar} alt={participantName} /> : getInitials(participantName)}
                </div>

                <div className="message-thread-body">
                  <div className="message-thread-top">
                    <strong>{participantName}</strong>
                    <span>{formatConversationTime(lastMessage.createdAt || conversation.updatedAt)}</span>
                  </div>
                  <small className="message-thread-contract">{contractLabel}</small>
                  <p>{lastMessageText}</p>
                </div>

                <div className="message-thread-meta">
                  {conversation.unreadCount > 0 && <span className="message-unread-badge">{conversation.unreadCount}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
