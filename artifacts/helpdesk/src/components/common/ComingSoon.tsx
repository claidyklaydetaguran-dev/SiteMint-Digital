import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface ComingSoonProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  availability?: string;
}

/**
 * Single reusable placeholder for approved-but-unbuilt voice-platform
 * destinations. Driven entirely by nav/route metadata — never a
 * per-page wrapper file.
 */
export function ComingSoon({ title, description, icon: Icon, availability }: ComingSoonProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-primary shadow-xs">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {availability && (
        <span className="mt-4 inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
          {availability}
        </span>
      )}
      <Button variant="secondary" className="mt-6" disabled>
        Not available yet
      </Button>
      <Link href="/" className="mt-4 text-sm font-medium text-primary hover:underline focus-visible:underline">
        Back to Overview
      </Link>
    </div>
  );
}
