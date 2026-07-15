import { useState, useEffect, useCallback, useMemo } from "react";
import ReceptionistAppShell from "./ReceptionistAppShell";
import { Bot, Plus, Trash2, ChevronUp, ChevronDown, Save, CheckCircle2, Loader2 } from "lucide-react";

interface AgentConfig {
  name:                string;
  industry:            string | null;
  greetingMessage:     string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

// Snapshot of last-persisted values, used to compute dirty state
interface SavedVersion {
  greeting:    string;
  description: string;
  questions:   string[];
}

const MAX_QUESTIONS = 6;
const BASE          = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Char counter helpers ───────────────────────────────────────────────────────

function charCounterColor(len: number, max: number): string {
  const pct = len / max;
  if (pct >= 1)   return "#dc2626"; // at limit — red
  if (pct >= 0.9) return "#b45309"; // 90 %+ — amber
  return "#9ca3af";                  // normal — muted
}

// ── Preview chat bubble ────────────────────────────────────────────────────────

function PreviewBubble({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 16, background: "#f3f4f6", borderRadius: 10, padding: "14px 16px" }}>
      <p style={{
        fontSize: 10.5, fontWeight: 700, color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
      }}>
        Preview — what callers will see first
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "linear-gradient(135deg, #062e71, #1249a8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Bot size={14} color="#fff" strokeWidth={1.8} />
        </div>
        <div style={{ position: "relative" }}>
          {/* "Preview" microlabel */}
          <span style={{
            position: "absolute", top: -18, left: 0,
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em",
            textTransform: "uppercase", color: "#9ca3af",
          }}>
            Preview
          </span>
          {/* Bubble with dashed border */}
          <div style={{
            display:      "inline-block",
            background:   "#062e71",
            color:        "#fff",
            borderRadius: "18px 18px 18px 4px",
            padding:      "10px 14px",
            fontSize:     14,
            lineHeight:   1.5,
            maxWidth:     280,
            wordBreak:    "break-word",
            boxShadow:    "0 1px 3px rgba(0,0,0,0.15)",
            border:       "2px dashed rgba(255,255,255,0.35)",
          }}>
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReceptionistAgentConfig() {
  const [config,       setConfig]    = useState<AgentConfig | null>(null);
  const [savedVersion, setSaved]     = useState<SavedVersion | null>(null);
  const [greeting,     setGreeting]  = useState("");
  const [description,  setDesc]      = useState("");
  const [questions,    setQuestions] = useState<string[]>([""]);
  const [saving,       setSaving]    = useState(false);
  const [saved,        setSavedFlag] = useState(false);
  const [error,        setError]     = useState<string | null>(null);
  const [loading,      setLoading]   = useState(true);
  const [flashIdx,     setFlashIdx]  = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/receptionist/agent-config`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load config");
      const data = (await r.json()) as { firm: AgentConfig };
      const f    = data.firm;
      const g    = f.greetingMessage     ?? "";
      const d    = f.businessDescription ?? "";
      const qs   = f.qualifyingQuestions.length > 0 ? f.qualifyingQuestions : [""];
      setConfig(f);
      setGreeting(g);
      setDesc(d);
      setQuestions(qs);
      // Saved version tracks the persisted values (filtered, no blanks)
      setSaved({ greeting: g, description: d, questions: f.qualifyingQuestions });
    } catch {
      setError("Could not load agent configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Dirty state ──────────────────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (!savedVersion) return false;
    const currentFiltered = questions.map((q) => q.trim()).filter(Boolean);
    return (
      greeting.trim()    !== savedVersion.greeting    ||
      description.trim() !== savedVersion.description ||
      JSON.stringify(currentFiltered) !== JSON.stringify(savedVersion.questions)
    );
  }, [greeting, description, questions, savedVersion]);

  // ── Question actions ─────────────────────────────────────────────────────────

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((q) => [...q, ""]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((q) => q.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, val: string) => {
    setQuestions((q) => q.map((v, i) => (i === idx ? val : v)));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= questions.length) return;
    setQuestions((q) => {
      const copy = [...q];
      [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
      return copy;
    });
    // Brief highlight on the destination row
    setFlashIdx(next);
    setTimeout(() => setFlashIdx(null), 450);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedFlag(false);
    try {
      const filtered     = questions.map((q) => q.trim()).filter(Boolean);
      const greetingOut  = greeting.trim()    || null;
      const descOut      = description.trim() || null;

      const r = await fetch(`${BASE}/api/receptionist/agent-config`, {
        method:      "PATCH",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          greetingMessage:     greetingOut,
          businessDescription: descOut,
          qualifyingQuestions: filtered,
        }),
      });
      if (!r.ok) {
        const d = (await r.json()) as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }

      // Normalize form state to match what was persisted
      setGreeting(greetingOut  ?? "");
      setDesc(descOut          ?? "");
      setQuestions(filtered.length > 0 ? filtered : [""]);
      setSaved({ greeting: greetingOut ?? "", description: descOut ?? "", questions: filtered });

      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ReceptionistAppShell>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12, padding: "80px 20px", color: "#6b7280",
        }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "#062e71" }} />
          <span style={{ fontSize: 13 }}>Loading configuration…</span>
        </div>
      </ReceptionistAppShell>
    );
  }

  const greetingPreview = greeting.trim() ||
    `Hi! You've reached ${config?.name ?? "us"}. How can I help you today?`;

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid #d1d5db", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, color: "#111827",
    outline: "none", background: "#fff", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.4,
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
    padding: 24, marginBottom: 20,
  };

  return (
    <ReceptionistAppShell>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(6,46,113,0.2)", flexShrink: 0,
          }}>
            <Bot size={22} color="#fff" strokeWidth={1.6} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#062e71", margin: 0 }}>
              Agent Configuration
            </h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0" }}>
              {config?.name ?? ""}
              {config?.industry ? ` · ${config.industry}` : ""}
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
            padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* ── Business Description ── */}
        <div style={cardStyle}>
          <label style={labelStyle}>Business Description</label>
          <p style={{ ...hintStyle, marginBottom: 10 }}>
            1–2 sentences describing what you do. The AI uses this as context when talking to callers.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. Bob Realty helps buyers and sellers in the greater Phoenix area find their perfect home."
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
          <div style={{
            ...hintStyle, marginTop: 6, textAlign: "right",
            color: charCounterColor(description.length, 1000),
            fontWeight: description.length / 1000 >= 0.9 ? 600 : 400,
            transition: "color 0.2s",
          }}>
            {description.length}/1000
          </div>
        </div>

        {/* ── Greeting Message ── */}
        <div style={cardStyle}>
          <label style={labelStyle}>Greeting Message</label>
          <p style={{ ...hintStyle, marginBottom: 10 }}>
            This is the AI's <strong>literal first SMS</strong> sent to every new caller.
            Keep it under 160 characters for SMS reliability.
          </p>
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={`Hi! You've reached ${config?.name ?? "us"}. How can I help you today?`}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
          <div style={{
            ...hintStyle, marginTop: 6,
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
          }}>
            <span style={{
              color: greeting.trim().length > 160 ? "#dc2626" : "#6b7280",
              fontWeight: greeting.trim().length > 160 ? 600 : 400,
              transition: "color 0.2s",
            }}>
              {greeting.trim().length > 0
                ? `${greeting.trim().length} chars${greeting.trim().length > 160 ? " — over 1 SMS, may be split" : ""}`
                : ""}
            </span>
            <span style={{
              color: charCounterColor(greeting.length, 500),
              fontWeight: greeting.length / 500 >= 0.9 ? 600 : 400,
              transition: "color 0.2s",
            }}>
              {greeting.length}/500
            </span>
          </div>

          <PreviewBubble text={greetingPreview} />
        </div>

        {/* ── Qualifying Questions ── */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Qualifying Questions
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 700,
                background: questions.filter((q) => q.trim()).length >= MAX_QUESTIONS
                  ? "#fef2f2"
                  : "rgba(6,46,113,0.07)",
                color: questions.filter((q) => q.trim()).length >= MAX_QUESTIONS
                  ? "#dc2626"
                  : "#062e71",
                padding: "2px 8px", borderRadius: 100,
              }}>
                {questions.filter((q) => q.trim()).length}/{MAX_QUESTIONS}
              </span>
            </label>
          </div>
          <p style={{ ...hintStyle, marginBottom: 14 }}>
            Topics the AI will work through naturally in conversation — one at a time,
            in a conversational way. Max {MAX_QUESTIONS}.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {questions.map((q, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex", gap: 8, alignItems: "center",
                  padding: "6px 8px", borderRadius: 8,
                  background: flashIdx === idx ? "rgba(6,46,113,0.07)" : "transparent",
                  transition: "background 0.4s ease",
                }}
              >
                {/* Reorder arrows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                    style={{
                      border: "1px solid #e5e7eb", borderRadius: 4, background: "#f9fafb",
                      padding: "2px 4px", cursor: idx === 0 ? "not-allowed" : "pointer",
                      opacity: idx === 0 ? 0.3 : 1, lineHeight: 1, display: "flex",
                    }}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === questions.length - 1}
                    title="Move down"
                    style={{
                      border: "1px solid #e5e7eb", borderRadius: 4, background: "#f9fafb",
                      padding: "2px 4px", cursor: idx === questions.length - 1 ? "not-allowed" : "pointer",
                      opacity: idx === questions.length - 1 ? 0.3 : 1, lineHeight: 1, display: "flex",
                    }}
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>

                <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, minWidth: 18, textAlign: "center" }}>
                  {idx + 1}.
                </span>

                <input
                  type="text"
                  value={q}
                  maxLength={200}
                  onChange={(e) => updateQuestion(idx, e.target.value)}
                  placeholder="e.g. What type of property are you looking for?"
                  style={{ ...inputStyle, flex: 1 }}
                />

                <button
                  onClick={() => removeQuestion(idx)}
                  title="Remove"
                  style={{
                    border: "1px solid #fca5a5", borderRadius: 6, background: "#fef2f2",
                    padding: "6px 8px", cursor: "pointer", display: "flex", flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  <Trash2 size={14} color="#dc2626" />
                </button>
              </div>
            ))}
          </div>

          {questions.length < MAX_QUESTIONS && (
            <button
              onClick={addQuestion}
              style={{
                marginTop: 10, display: "flex", alignItems: "center", gap: 6,
                border: "1px dashed #d1d5db", borderRadius: 8, background: "#f9fafb",
                padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#374151",
                width: "100%", justifyContent: "center", transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
            >
              <Plus size={14} />
              Add question
            </button>
          )}
        </div>

        {/* ── Save row ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => { void save(); }}
            disabled={saving || !isDirty}
            style={{
              background: saving || !isDirty
                ? "#e5e7eb"
                : "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
              color: saving || !isDirty ? "#9ca3af" : "#fff",
              border: "none", borderRadius: 10,
              padding: "12px 28px", fontSize: 14, fontWeight: 700,
              cursor: saving || !isDirty ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: saving || !isDirty ? "none" : "0 2px 12px rgba(6,46,113,0.25)",
              transition: "background 0.2s, box-shadow 0.2s, color 0.2s",
            }}
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={15} />
                {isDirty ? "Save Changes" : "No Changes"}
              </>
            )}
          </button>

          {saved && (
            <span style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 13, color: "#16a34a", fontWeight: 600,
            }}>
              <CheckCircle2 size={15} strokeWidth={2.2} />
              Saved successfully
            </span>
          )}
        </div>

      </div>
    </ReceptionistAppShell>
  );
}
