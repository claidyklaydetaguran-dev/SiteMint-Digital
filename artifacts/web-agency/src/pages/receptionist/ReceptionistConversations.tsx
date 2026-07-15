import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import ReceptionistAppShell from "./ReceptionistAppShell";
import { MessageSquare, Phone, Clock, ArrowLeft, Inbox, Lock, AlertCircle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Conversation {
  id: number;
  createdAt: string;
  lastMessageAt: string;
  firmId: number;
  callerPhone: string;
  status: string;
  isOverCap?: boolean;
}

interface Message {
  id: number;
  createdAt: string;
  conversationId: number;
  direction: "inbound" | "outbound";
  body: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function statusColor(status: string): string {
  if (status === "in_progress") return "#16a34a";
  if (status === "completed")   return "#2563eb";
  return "#9ca3af";
}

// ── Trial limit badge ──────────────────────────────────────────────────────────

function TrialLimitBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10, fontWeight: 600, color: "#9ca3af",
      background: "rgba(156,163,175,0.12)",
      border: "1px solid rgba(156,163,175,0.25)",
      borderRadius: 100, padding: "1px 6px",
    }}>
      <Lock size={8} />
      Trial limit reached
    </span>
  );
}

// ── Skeleton row for loading state ─────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(6,46,113,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ width: 120, height: 12, borderRadius: 6, background: "#e5e7eb" }} />
        <div style={{ width: 36, height: 10, borderRadius: 6, background: "#e5e7eb" }} />
      </div>
      <div style={{ width: 64, height: 10, borderRadius: 6, background: "#f3f4f6" }} />
    </div>
  );
}

// ── List panel ─────────────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", textAlign: "center",
          padding: "32px 24px", color: "#9ca3af",
        }}
      >
        <Inbox size={40} strokeWidth={1.2} style={{ marginBottom: 12, color: "#cbd5e1" }} />
        <p style={{ fontWeight: 600, fontSize: 13.5, color: "#6b7280", marginBottom: 4 }}>
          No conversations yet
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6 }}>
          When customers text your AI receptionist, conversations will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      {conversations.map((c) => (
        <div
          key={c.id}
          onClick={() => onSelect(c.id)}
          style={{
            padding: "14px 16px",
            cursor: "pointer",
            borderBottom: "1px solid rgba(6,46,113,0.06)",
            background: selectedId === c.id ? "rgba(6,46,113,0.06)" : "transparent",
            transition: "background 0.12s",
            opacity: c.isOverCap ? 0.75 : 1,
          }}
          onMouseEnter={(e) => {
            if (selectedId !== c.id) e.currentTarget.style.background = "rgba(6,46,113,0.03)";
          }}
          onMouseLeave={(e) => {
            if (selectedId !== c.id) e.currentTarget.style.background = "transparent";
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Phone size={13} style={{ color: "#6b7280" }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>
                {c.callerPhone}
              </span>
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtDate(c.lastMessageAt)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10.5, fontWeight: 600, color: statusColor(c.status),
              textTransform: "capitalize",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: statusColor(c.status), flexShrink: 0,
              }} />
              {c.status.replace("_", " ")}
            </span>
            {c.isOverCap && <TrialLimitBadge />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Message thread ─────────────────────────────────────────────────────────────

function MessageThread({
  conversation,
  messages,
  onBack,
}: {
  conversation: Conversation;
  messages: Message[];
  onBack: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid rgba(6,46,113,0.08)",
        display: "flex", alignItems: "center", gap: 12,
        background: "#fff", flexShrink: 0,
      }}>
        <button
          className="md:hidden"
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#062e71", padding: 4 }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <Phone size={14} style={{ color: "#6b7280" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111827" }}>
              {conversation.callerPhone}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: statusColor(conversation.status),
              border: `1px solid ${statusColor(conversation.status)}`,
              borderRadius: 100, padding: "1px 6px", textTransform: "capitalize",
            }}>
              {conversation.status.replace("_", " ")}
            </span>
            {conversation.isOverCap && <TrialLimitBadge />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            <Clock size={11} style={{ color: "#9ca3af" }} />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              Started {new Date(conversation.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Over-cap notice */}
      {conversation.isOverCap && (
        <div style={{
          background: "rgba(156,163,175,0.08)",
          borderBottom: "1px solid rgba(156,163,175,0.18)",
          padding: "8px 20px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Lock size={12} style={{ color: "#9ca3af", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            This conversation was logged but the AI did not reply — your trial limit was reached.
            New callers will not receive automated replies until you{" "}
            <a href="/app/settings#upgrade" style={{ color: "#062e71", fontWeight: 600, textDecoration: "underline" }}>
              upgrade to Pro
            </a>
            .
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 40 }}>
            <MessageSquare size={28} strokeWidth={1.2} style={{ margin: "0 auto 8px", color: "#cbd5e1" }} />
            No messages in this conversation yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: m.direction === "outbound" ? "row-reverse" : "row",
                  gap: 8,
                }}
              >
                <div style={{
                  maxWidth: "70%",
                  padding: "9px 13px",
                  borderRadius: m.direction === "outbound" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.direction === "outbound"
                    ? "linear-gradient(135deg, #062e71 0%, #0a3d91 100%)"
                    : "#f1f5f9",
                  color: m.direction === "outbound" ? "#fff" : "#111827",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  boxShadow: m.direction === "outbound"
                    ? "0 2px 8px rgba(6,46,113,0.20)"
                    : "0 1px 3px rgba(0,0,0,0.06)",
                }}>
                  {m.body}
                  <div style={{
                    fontSize: 10, marginTop: 4, opacity: 0.65,
                    textAlign: m.direction === "outbound" ? "right" : "left",
                  }}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReceptionistConversations() {
  const [, params]        = useRoute("/app/conversations/:id");
  const [, navigate]      = useLocation();
  const urlId             = params?.id ? parseInt(params.id, 10) : null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId,    setSelectedId]    = useState<number | null>(urlId);
  const [detail,        setDetail]        = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [loadingList,   setLoadingList]   = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError,     setListError]     = useState(false);
  const [showThread,    setShowThread]    = useState(!!urlId);

  useEffect(() => {
    fetch("/api/receptionist/conversations", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json() as Promise<{ conversations: Conversation[] }>;
      })
      .then((d) => setConversations(d.conversations))
      .catch(() => setListError(true))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setLoadingDetail(true);
    fetch(`/api/receptionist/conversations/${selectedId}`, { credentials: "include" })
      .then((r) => r.json() as Promise<{ conversation: Conversation; messages: Message[] }>)
      .then((d) => { setDetail(d); setShowThread(true); })
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
    navigate(`/app/conversations/${selectedId}`, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleSelect = (id: number) => setSelectedId(id);
  const handleBack   = () => { setShowThread(false); setSelectedId(null); navigate("/app", { replace: true }); };

  return (
    <ReceptionistAppShell>
      <div style={{ display: "flex", height: "calc(100vh - 38px)", overflow: "hidden" }}>

        {/* ── List panel ── */}
        <div
          className={showThread ? "hidden md:flex" : "flex"}
          style={{
            width: "100%", maxWidth: 340,
            flexDirection: "column",
            borderRight: "1px solid rgba(6,46,113,0.08)",
            background: "#fff",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <div style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid rgba(6,46,113,0.07)",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <MessageSquare size={16} style={{ color: "#062e71" }} />
            <h2 style={{ fontSize: 14.5, fontWeight: 700, color: "#062e71" }}>Conversations</h2>
            {!loadingList && !listError && (
              <span style={{
                marginLeft: "auto",
                fontSize: 11, fontWeight: 700, color: "#6b7280",
                background: "rgba(6,46,113,0.07)", padding: "2px 7px", borderRadius: 100,
              }}>
                {conversations.length}
              </span>
            )}
          </div>

          {loadingList ? (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : listError ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", flex: 1, padding: "32px 24px", textAlign: "center",
            }}>
              <AlertCircle size={28} strokeWidth={1.4} style={{ color: "#f87171", marginBottom: 10 }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                Could not load conversations
              </p>
              <p style={{ fontSize: 12, color: "#9ca3af" }}>
                Check your connection and refresh the page.
              </p>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* ── Thread panel ── */}
        <AnimatePresence>
          {(showThread || selectedId) && (
            <motion.div
              key="thread"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={showThread ? "flex" : "hidden md:flex"}
              style={{ flex: 1, flexDirection: "column", overflow: "hidden", background: "#f8fafc" }}
            >
              {loadingDetail ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detail ? (
                <MessageThread
                  conversation={detail.conversation}
                  messages={detail.messages}
                  onBack={handleBack}
                />
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
                  <MessageSquare size={36} strokeWidth={1.2} style={{ color: "#cbd5e1", marginBottom: 12 }} />
                  <p style={{ color: "#94a3b8", fontSize: 13 }}>Select a conversation to view the thread</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Desktop empty state (no selection) ── */}
        {!selectedId && (
          <div
            className="hidden md:flex"
            style={{
              flex: 1, flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: "#94a3b8", textAlign: "center", padding: 32,
            }}
          >
            <MessageSquare size={40} strokeWidth={1.2} style={{ marginBottom: 12, color: "#cbd5e1" }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>Select a conversation</p>
            <p style={{ fontSize: 12.5, marginTop: 4 }}>Click any item on the left to read the thread</p>
          </div>
        )}
      </div>
    </ReceptionistAppShell>
  );
}
