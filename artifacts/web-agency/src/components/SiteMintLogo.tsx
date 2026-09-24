interface SiteMintLogoProps {
  /**
   * "dark" / "light" size the mark for a light/dark page background,
   * unchanged. "ops" is the same light-background pairing but re-tinted to
   * the CRM's own Glacier Mint tokens (--sm-teal-900 / --sm-mint-500,
   * tokens-v5.css) instead of the generic slate-800/emerald-400 this mark
   * always used — for callers that render inside a `.v2-dashboard-shell`
   * scope (CrmLayout, AdminLogin, AdminDashboard) so the CRM's own logo
   * matches its own palette. "dark" and "light" render byte-for-byte as
   * before for every other caller (public site header/footer, Discovery).
   */
  variant?: "dark" | "light" | "ops";
  showText?: boolean;
  iconSize?: number;
  className?: string;
}

export function SiteMintLogo({
  variant = "dark",
  showText = true,
  iconSize = 32,
  className = "",
}: SiteMintLogoProps) {
  const isDark = variant === "dark";
  const isOps = variant === "ops";
  const structuralFill = isOps ? "var(--sm-teal-900, #173642)" : "#1e293b";
  const accentFill = isOps ? "var(--sm-mint-500, #32C5D2)" : "#34d399";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Background square */}
        <rect
          width="40"
          height="40"
          rx="9"
          fill={isDark ? structuralFill : "#ffffff"}
        />
        {/* Outer diamond — white/navy */}
        <path
          d="M20 8L32 20L20 32L8 20Z"
          fill={isDark ? "#ffffff" : structuralFill}
          opacity="0.12"
        />
        {/* Middle diamond — mint accent */}
        <path
          d="M20 11L29 20L20 29L11 20Z"
          fill={accentFill}
          opacity="0.90"
        />
        {/* Inner diamond — background color creates depth */}
        <path
          d="M20 16L24 20L20 24L16 20Z"
          fill={isDark ? structuralFill : "#ffffff"}
        />
        {/* Mint dot at top — the "spark" */}
        <circle cx="20" cy="13" r="2.5" fill={accentFill} />
      </svg>

      {showText && (
        <span
          className={`font-serif font-semibold text-xl tracking-tight leading-none ${
            isDark ? "text-foreground" : "text-background"
          }`}
        >
          SiteMint{" "}
          <span className={isDark ? "text-primary" : "text-background/80"}>
            Digital
          </span>
        </span>
      )}
    </div>
  );
}
