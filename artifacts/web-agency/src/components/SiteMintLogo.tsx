interface SiteMintLogoProps {
  variant?: "dark" | "light";
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
          fill={isDark ? "#1e293b" : "#ffffff"}
        />
        {/* Outer diamond — white/navy */}
        <path
          d="M20 8L32 20L20 32L8 20Z"
          fill={isDark ? "#ffffff" : "#1e293b"}
          opacity="0.12"
        />
        {/* Middle diamond — mint/emerald */}
        <path
          d="M20 11L29 20L20 29L11 20Z"
          fill="#34d399"
          opacity="0.90"
        />
        {/* Inner diamond — background color creates depth */}
        <path
          d="M20 16L24 20L20 24L16 20Z"
          fill={isDark ? "#1e293b" : "#ffffff"}
        />
        {/* Mint dot at top — the "spark" */}
        <circle cx="20" cy="13" r="2.5" fill="#34d399" />
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
