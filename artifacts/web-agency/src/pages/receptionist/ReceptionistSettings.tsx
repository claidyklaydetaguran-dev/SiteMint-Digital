import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import ReceptionistAppShell from "./ReceptionistAppShell";
import { Settings, Zap, CheckCircle2, Lock, Loader2, AlertCircle } from "lucide-react";

interface FirmData {
  planTier: string;
  trialConversationsLimit: number;
}

interface MeResponse {
  firm: FirmData;
  conversationCount: number;
}

// ── Billing section ───────────────────────────────────────────────────────────

function BillingSection({ firm, conversationCount }: { firm: FirmData; conversationCount: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/receptionist/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
      });
      const data = await resp.json() as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        setError(data.error ?? "Failed to start checkout");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  };

  if (firm.planTier === "paid") {
    return (
      <div style={{
        background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
        border: "1px solid #86efac",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "#22c55e",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <CheckCircle2 size={20} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#15803d", marginBottom: 3 }}>
            Pro Plan — Active
          </div>
          <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.5 }}>
            Your AI Receptionist is running with no conversation limits. All incoming
            leads are answered automatically 24/7.
          </div>
        </div>
      </div>
    );
  }

  const used    = Math.min(conversationCount, firm.trialConversationsLimit);
  const limit   = firm.trialConversationsLimit;
  const pct     = Math.min(100, Math.round((used / limit) * 100));
  const isAtCap = conversationCount >= limit;
  const barColor = isAtCap ? "#ef4444" : pct >= 80 ? "#f59e0b" : "#3b82f6";

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Zap size={17} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Trial Plan</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {used} of {limit} trial conversations used
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 6, borderRadius: 99,
        background: "#f3f4f6",
        marginBottom: 16,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 99,
          background: barColor,
          transition: "width 0.4s ease",
        }} />
      </div>

      {isAtCap && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, padding: "10px 12px",
          marginBottom: 14,
        }}>
          <Lock size={13} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#dc2626", lineHeight: 1.5 }}>
            Your trial limit has been reached. New callers will not receive an AI reply
            until you upgrade to Pro.
          </span>
        </div>
      )}

      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, lineHeight: 1.5 }}>
        Upgrade to unlock unlimited conversations, priority support, and advanced intake
        analytics.
      </div>

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#fef2f2", borderRadius: 8, padding: "8px 12px",
          marginBottom: 12, fontSize: 12, color: "#dc2626",
        }}>
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      <button
        onClick={() => { void handleUpgrade(); }}
        disabled={loading}
        style={{
          width: "100%",
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          background: loading
            ? "#93c5fd"
            : "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          transition: "opacity 0.15s",
        }}
      >
        {loading ? (
          <>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            Redirecting to checkout…
          </>
        ) : (
          <>
            <Zap size={14} />
            Upgrade to Pro
          </>
        )}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReceptionistSettings() {
  const [location] = useLocation();
  const [data, setData]         = useState<MeResponse | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [polling, setPolling]   = useState(false);

  const justUpgraded =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("upgraded") === "1";

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchMe = async (attempt = 0): Promise<void> => {
      try {
        const resp = await fetch("/api/receptionist/auth/me", { credentials: "include" });
        if (!resp.ok) { setFetchErr("Failed to load account data"); return; }
        const json = await resp.json() as MeResponse;
        if (cancelled) return;
        setData(json);

        if (justUpgraded && json.firm.planTier !== "paid" && attempt < 5) {
          setPolling(true);
          pollTimer = setTimeout(() => { void fetchMe(attempt + 1); }, 2000);
        } else {
          setPolling(false);
        }
      } catch {
        if (!cancelled) setFetchErr("Network error");
      }
    };

    void fetchMe();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <ReceptionistAppShell>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(6,46,113,0.22)",
          }}>
            <Settings size={22} color="#fff" strokeWidth={1.6} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Account Settings</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Billing, plan, and preferences</div>
          </div>
        </div>

        {/* Post-upgrade banner */}
        {justUpgraded && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: data?.firm.planTier === "paid" ? "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" : "#fffbeb",
            border: `1px solid ${data?.firm.planTier === "paid" ? "#86efac" : "#fde68a"}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 20,
          }}>
            {polling ? (
              <Loader2 size={15} color="#b45309" style={{ marginTop: 1, flexShrink: 0, animation: "spin 1s linear infinite" }} />
            ) : (
              <CheckCircle2 size={15} color={data?.firm.planTier === "paid" ? "#16a34a" : "#b45309"} style={{ marginTop: 1, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, color: data?.firm.planTier === "paid" ? "#15803d" : "#92400e", lineHeight: 1.5 }}>
              {data?.firm.planTier === "paid"
                ? "Your account has been upgraded to Pro. Welcome!"
                : polling
                  ? "Payment received — activating your Pro plan, hang tight…"
                  : "Thanks! Your payment is processing — this can take a moment to activate."}
            </span>
          </div>
        )}

        {/* Loading */}
        {!data && !fetchErr && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280", fontSize: 14, padding: "32px 0", justifyContent: "center" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Loading account…
          </div>
        )}

        {fetchErr && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#dc2626" }}>
            {fetchErr}
          </div>
        )}

        {/* Billing section */}
        {data && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
              Billing &amp; Plan
            </div>
            <BillingSection firm={data.firm} conversationCount={data.conversationCount} />
          </section>
        )}

      </div>
    </ReceptionistAppShell>
  );
}
