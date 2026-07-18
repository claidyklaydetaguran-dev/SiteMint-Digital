import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRefreshSessionAfterLogin } from "@/hooks/useSession";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { AlertCircle } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refreshSessionAfterLogin = useRefreshSessionAfterLogin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/receptionist/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Invalid email or password");
      }
      // Fetch the new session before navigating so the authenticated app
      // never briefly renders under the previous firm's identity or cache.
      await refreshSessionAfterLogin();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient mint glow, decorative only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl dark:bg-accent/10"
      />

      <div className="w-full max-w-sm relative">
        {/* Logo mark */}
        <div className="flex justify-center mb-8">
          <SiteMintLogo iconSize={40} showWordmark={false} />
        </div>

        {/* Heading */}
        <div className="text-center mb-7">
          <h1 className="font-display text-2xl font-semibold text-foreground">Sign in to SiteMint</h1>
          <p className="text-sm text-muted-foreground mt-1.5">AI Receptionist Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                className="h-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="h-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            {error && (
              <div
                id="login-error"
                role="alert"
                className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/25 rounded-lg px-3 py-2.5"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full h-10 font-semibold shadow-xs" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Need an account?{" "}
          <a
            href="/ai-receptionist/signup"
            className="text-primary hover:underline font-medium transition-colors focus-visible:underline"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
