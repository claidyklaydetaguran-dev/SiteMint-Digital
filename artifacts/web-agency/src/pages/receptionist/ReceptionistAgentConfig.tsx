import { useState, useEffect, useCallback } from "react";
import ReceptionistAppShell from "./ReceptionistAppShell";
import { Bot, Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";

interface AgentConfig {
  name:                string;
  industry:            string | null;
  greetingMessage:     string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

const MAX_QUESTIONS   = 6;
const BASE            = import.meta.env.BASE_URL.replace(/\/$/, "");

function getBubbleStyle(): React.CSSProperties {
  return {
    display:         "inline-block",
    background:      "#062e71",
    color:           "#ffffff",
    borderRadius:    "18px 18px 18px 4px",
    padding:         "10px 14px",
    fontSize:        14,
    lineHeight:      1.5,
    maxWidth:        280,
    wordBreak:       "break-word",
    boxShadow:       "0 1px 3px rgba(0,0,0,0.15)",
  };
}

export default function ReceptionistAgentConfig() {
  const [config, setConfig]       = useState<AgentConfig | null>(null);
  const [greeting, setGreeting]   = useState("");
  const [description, setDesc]    = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/receptionist/agent-config`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load config");
      const data = (await r.json()) as { firm: AgentConfig };
      setConfig(data.firm);
      setGreeting(data.firm.greetingMessage     ?? "");
      setDesc(data.firm.businessDescription     ?? "");
      setQuestions(data.firm.qualifyingQuestions.length > 0 ? data.firm.qualifyingQuestions : [""]);
    } catch {
      setError("Could not load agent configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions(q => [...q, ""]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(q => q.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, val: string) => {
    setQuestions(q => q.map((v, i) => i === idx ? val : v));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= questions.length) return;
    setQuestions(q => {
      const copy = [...q];
      [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const filtered = questions.map(q => q.trim()).filter(Boolean);
      const r = await fetch(`${BASE}/api/receptionist/agent-config`, {
        method:      "PATCH",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          greetingMessage:     greeting.trim() || null,
          businessDescription: description.trim() || null,
          qualifyingQuestions: filtered,
        }),
      });
      if (!r.ok) {
        const d = (await r.json()) as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ReceptionistAppShell>
        <div style={{ padding: 40, color: "#6b7280", textAlign: "center" }}>
          Loading configuration…
        </div>
      </ReceptionistAppShell>
    );
  }

  const greetingPreview = greeting.trim() ||
    `Hi! You've reached ${config?.name ?? "us"}. How can I help you today?`;

  const inputStyle: React.CSSProperties = {
    width:        "100%",
    border:       "1px solid #d1d5db",
    borderRadius: 8,
    padding:      "9px 12px",
    fontSize:     14,
    color:        "#111827",
    outline:      "none",
    background:   "#fff",
    boxSizing:    "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display:      "block",
    fontSize:     13,
    fontWeight:   600,
    color:        "#374151",
    marginBottom: 6,
  };

  const hintStyle: React.CSSProperties = {
    fontSize:   12,
    color:      "#6b7280",
    marginTop:  4,
    lineHeight: 1.4,
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
            boxShadow: "0 2px 12px rgba(6,46,113,0.2)",
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

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
            padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Business Description */}
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
          padding: 24, marginBottom: 20,
        }}>
          <label style={labelStyle}>Business Description</label>
          <p style={{ ...hintStyle, marginBottom: 10 }}>
            1–2 sentences describing what you do. The AI uses this as context when talking to callers.
          </p>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. Bob Realty helps buyers and sellers in the greater Phoenix area find their perfect home. We specialize in residential properties and first-time homebuyers."
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
          <div style={{ ...hintStyle, marginTop: 6, textAlign: "right" }}>
            {description.length}/1000
          </div>
        </div>

        {/* Greeting Message */}
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
          padding: 24, marginBottom: 20,
        }}>
          <label style={labelStyle}>Greeting Message</label>
          <p style={{ ...hintStyle, marginBottom: 10 }}>
            This is the AI's <strong>literal first SMS</strong> sent to every new caller. Keep it under 160 characters for SMS reliability.
          </p>
          <textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={`Hi! You've reached ${config?.name ?? "us"}. How can I help you today?`}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
          />
          <div style={{ ...hintStyle, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: greeting.trim().length > 160 ? "#dc2626" : "#6b7280" }}>
              {greeting.trim().length > 0 ? `${greeting.trim().length} chars${greeting.trim().length > 160 ? " — over 1 SMS, may be split" : ""}` : ""}
            </span>
            <span>{greeting.length}/500</span>
          </div>

          {/* Live preview */}
          <div style={{
            marginTop: 16,
            background: "#f3f4f6",
            borderRadius: 10,
            padding: "14px 16px",
          }}>
            <p style={{ ...hintStyle, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
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
              <div style={getBubbleStyle()}>
                {greetingPreview}
              </div>
            </div>
          </div>
        </div>

        {/* Qualifying Questions */}
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
          padding: 24, marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Qualifying Questions
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 700,
                background: questions.filter(q => q.trim()).length >= MAX_QUESTIONS ? "#fef2f2" : "rgba(6,46,113,0.07)",
                color: questions.filter(q => q.trim()).length >= MAX_QUESTIONS ? "#dc2626" : "#062e71",
                padding: "2px 8px", borderRadius: 100,
              }}>
                {questions.filter(q => q.trim()).length}/{MAX_QUESTIONS}
              </span>
            </label>
          </div>
          <p style={{ ...hintStyle, marginBottom: 14 }}>
            Topics the AI will work through naturally during the conversation. The AI asks one at a time, in a conversational way. Max {MAX_QUESTIONS}.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {questions.map((q, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
                }}>
                  <button
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    style={{
                      border: "1px solid #e5e7eb", borderRadius: 4, background: "#f9fafb",
                      padding: "2px 4px", cursor: idx === 0 ? "not-allowed" : "pointer",
                      opacity: idx === 0 ? 0.35 : 1, lineHeight: 1, display: "flex",
                    }}
                    title="Move up"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === questions.length - 1}
                    style={{
                      border: "1px solid #e5e7eb", borderRadius: 4, background: "#f9fafb",
                      padding: "2px 4px", cursor: idx === questions.length - 1 ? "not-allowed" : "pointer",
                      opacity: idx === questions.length - 1 ? 0.35 : 1, lineHeight: 1, display: "flex",
                    }}
                    title="Move down"
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
                  onChange={e => updateQuestion(idx, e.target.value)}
                  placeholder={`e.g. What type of property are they looking for?`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => removeQuestion(idx)}
                  style={{
                    border: "1px solid #fca5a5", borderRadius: 6, background: "#fef2f2",
                    padding: "6px 8px", cursor: "pointer", display: "flex", flexShrink: 0,
                  }}
                  title="Remove"
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
                marginTop: 12, display: "flex", alignItems: "center", gap: 6,
                border: "1px dashed #d1d5db", borderRadius: 8, background: "#f9fafb",
                padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#374151",
                width: "100%", justifyContent: "center",
              }}
            >
              <Plus size={14} />
              Add question
            </button>
          )}
        </div>

        {/* Save button */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => { void save(); }}
            disabled={saving}
            style={{
              background:    saving ? "#6b7280" : "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
              color:         "#fff",
              border:        "none",
              borderRadius:  10,
              padding:       "12px 28px",
              fontSize:      14,
              fontWeight:    700,
              cursor:        saving ? "not-allowed" : "pointer",
              display:       "flex",
              alignItems:    "center",
              gap:           8,
              boxShadow:     saving ? "none" : "0 2px 12px rgba(6,46,113,0.25)",
            }}
          >
            <Save size={15} />
            {saving ? "Saving…" : "Save Configuration"}
          </button>

          {saved && (
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
              ✓ Saved successfully
            </span>
          )}
        </div>

      </div>
    </ReceptionistAppShell>
  );
}
