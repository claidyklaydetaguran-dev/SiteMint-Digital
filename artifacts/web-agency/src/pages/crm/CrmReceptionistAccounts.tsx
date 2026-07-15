import { useState, useEffect, useMemo } from "react";
import { CrmLayout } from "./CrmLayout";
import { Building2, ArrowUpDown, ArrowUp, ArrowDown, Users, Zap } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Account {
  id: number;
  name: string;
  email: string | null;
  twilioNumber: string;
  planTier: string;
  trialConversationsLimit: number;
  conversationCount: number;
  createdAt: string;
}

type SortKey = "createdAt" | "name" | "conversationCount" | "planTier";
type SortDir = "asc" | "desc";

// ── Helpers ────────────────────────────────────────────────────────────────────

function planBadge(tier: string) {
  const isPaid = tier === "paid";
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: isPaid ? "#16a34a" : "#d97706",
      background: isPaid ? "rgba(22,163,74,0.10)" : "rgba(217,119,6,0.10)",
      border: `1px solid ${isPaid ? "rgba(22,163,74,0.25)" : "rgba(217,119,6,0.25)"}`,
      borderRadius: 100, padding: "2px 8px",
    }}>
      {tier}
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={12} style={{ color: "#d1d5db", flexShrink: 0 }} />;
  return sortDir === "asc"
    ? <ArrowUp   size={12} style={{ color: "#062e71", flexShrink: 0 }} />
    : <ArrowDown size={12} style={{ color: "#062e71", flexShrink: 0 }} />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CrmReceptionistAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [sortKey,  setSortKey]  = useState<SortKey>("createdAt");
  const [sortDir,  setSortDir]  = useState<SortDir>("desc");

  useEffect(() => {
    const token = localStorage.getItem("adminToken") ?? "";
    fetch("/api/admin/receptionist-accounts", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ accounts: Account[] }>;
      })
      .then((d) => setAccounts(d.accounts))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const copy = [...accounts];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "conversationCount") {
        cmp = a.conversationCount - b.conversationCount;
      } else if (sortKey === "planTier") {
        cmp = a.planTier.localeCompare(b.planTier);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [accounts, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const Th = ({
    label, col, style,
  }: { label: string; col: SortKey; style?: React.CSSProperties }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding: "10px 14px", textAlign: "left",
        fontSize: 11.5, fontWeight: 600, color: "#6b7280",
        letterSpacing: "0.04em", textTransform: "uppercase",
        cursor: "pointer", userSelect: "none",
        whiteSpace: "nowrap", ...style,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        {label} <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  );

  const totalPaid  = accounts.filter((a) => a.planTier === "paid").length;
  const totalTrial = accounts.filter((a) => a.planTier !== "paid").length;

  return (
    <CrmLayout>
      {/* ── Header ── */}
      <div style={{
        padding: "28px 32px 20px",
        borderBottom: "1px solid rgba(6,46,113,0.08)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Building2 size={20} style={{ color: "#fff" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#062e71", margin: 0 }}>
              AI Receptionist Accounts
            </h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0" }}>
              Businesses signed up for the AI Receptionist product
            </p>
          </div>
        </div>

        {/* Summary tiles */}
        {!loading && (
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { label: "Total signups", value: accounts.length, icon: Users, color: "#062e71" },
              { label: "Trial",         value: totalTrial,       icon: Zap,   color: "#d97706" },
              { label: "Paid",          value: totalPaid,        icon: Zap,   color: "#16a34a" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{
                background: "#fff", border: "1px solid rgba(6,46,113,0.09)",
                borderRadius: 10, padding: "10px 16px", minWidth: 90, textAlign: "center",
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "24px 32px" }}>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.20)",
            borderRadius: 10, padding: "16px 20px", color: "#b91c1c", fontSize: 13,
          }}>
            Failed to load accounts: {error}
          </div>
        )}

        {!loading && !error && accounts.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            color: "#9ca3af",
          }}>
            <Building2 size={36} strokeWidth={1.2} style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 500 }}>No signups yet</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>
              When businesses sign up via the AI Receptionist landing page, they'll appear here.
            </p>
          </div>
        )}

        {!loading && !error && accounts.length > 0 && (
          <div style={{
            background: "#fff", border: "1px solid rgba(6,46,113,0.09)",
            borderRadius: 12, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid rgba(6,46,113,0.08)" }}>
                  <Th label="Business"          col="name"              />
                  <th style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Email</th>
                  <Th label="Plan"              col="planTier"          />
                  <th style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Phone</th>
                  <Th label="Conversations"     col="conversationCount" />
                  <th style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Trial limit</th>
                  <Th label="Signed up"         col="createdAt"         />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom: i < sorted.length - 1 ? "1px solid rgba(6,46,113,0.06)" : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(6,46,113,0.02)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>{a.name}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 13, color: "#374151" }}>{a.email ?? "—"}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>{planBadge(a.planTier)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 13, color: "#6b7280", fontFamily: "monospace" }}>
                        {a.twilioNumber || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <span style={{
                        fontSize: 13.5, fontWeight: 700,
                        color: a.conversationCount >= a.trialConversationsLimit && a.planTier !== "paid"
                          ? "#d97706" : "#062e71",
                      }}>
                        {a.conversationCount}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <span style={{ fontSize: 13, color: "#6b7280" }}>{a.trialConversationsLimit}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 12.5, color: "#9ca3af" }}>
                        {new Date(a.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
