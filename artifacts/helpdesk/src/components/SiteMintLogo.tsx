import { cn } from "@/lib/utils";

interface SiteMintLogoProps {
  showWordmark?: boolean;
  iconSize?: number;
  className?: string;
}

/**
 * SiteMint diamond mark + wordmark. Mint stays constant; ink/background
 * adapt automatically via semantic tokens so the mark reads correctly in
 * both light and dark mode without a variant prop.
 */
export function SiteMintLogo({
  showWordmark = true,
  iconSize = 32,
  className = "",
}: SiteMintLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="9" className="fill-primary" />
        <path d="M20 8L32 20L20 32L8 20Z" className="fill-primary-foreground" opacity="0.14" />
        <path d="M20 11L29 20L20 29L11 20Z" fill="#34D399" opacity="0.92" />
        <path d="M20 16L24 20L20 24L16 20Z" className="fill-primary" />
        <circle cx="20" cy="13" r="2.5" fill="#34D399" />
      </svg>

      {showWordmark && (
        <span className="font-display font-semibold text-lg leading-none tracking-tight text-foreground">
          SiteMint <span className="text-primary">AI Receptionist</span>
        </span>
      )}
    </div>
  );
}
