import React from "react";

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
  // Our funnel is forced dark, so we treat it generally as 'dark'
  const isDark = true;

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
          fill={"#1e293b"}
        />
        {/* Outer diamond — white/navy */}
        <path
          d="M20 8L32 20L20 32L8 20Z"
          fill={"#ffffff"}
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
          fill={"#1e293b"}
        />
        {/* Mint dot at top — the "spark" */}
        <circle cx="20" cy="13" r="2.5" fill="#34d399" />
      </svg>

      {showText && (
        <span
          className={`font-serif font-semibold text-xl tracking-tight leading-none text-foreground`}
        >
          SiteMint{" "}
          <span className="text-primary">
            Digital
          </span>
        </span>
      )}
    </div>
  );
}
