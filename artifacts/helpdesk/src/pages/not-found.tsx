import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteMintLogo } from "@/components/SiteMintLogo";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-6">
        <SiteMintLogo iconSize={36} showWordmark={false} />
      </div>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-primary shadow-xs">
        <Compass className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="font-display text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link href="/" className="mt-6">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
