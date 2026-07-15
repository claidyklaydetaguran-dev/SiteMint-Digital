import ReceptionistAppShell from "./ReceptionistAppShell";
import { Settings } from "lucide-react";

export default function ReceptionistSettings() {
  return (
    <ReceptionistAppShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div
          style={{
            width: 64, height: 64, borderRadius: 16,
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20, boxShadow: "0 4px 20px rgba(6,46,113,0.25)",
          }}
        >
          <Settings size={30} color="#fff" strokeWidth={1.6} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#062e71", marginBottom: 8 }}>
          Account Settings
        </h2>
        <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 360, lineHeight: 1.6 }}>
          Manage your account details, notification preferences, billing, and team
          access. Full settings are coming as part of the next product release.
        </p>
        <span style={{
          marginTop: 20, display: "inline-block",
          background: "rgba(6,46,113,0.07)",
          color: "#062e71", fontSize: 11.5, fontWeight: 700,
          letterSpacing: "0.05em", textTransform: "uppercase",
          padding: "5px 12px", borderRadius: 100,
        }}>
          Coming Soon
        </span>
      </div>
    </ReceptionistAppShell>
  );
}
