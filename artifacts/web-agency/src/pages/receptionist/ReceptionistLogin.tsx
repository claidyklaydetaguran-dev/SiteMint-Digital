import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";

export default function ReceptionistLogin() {
  const [, navigate] = useLocation();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/receptionist/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) { setError(d.error ?? "Login failed — please try again."); return; }
      navigate("/ai-receptionist/dashboard");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(145deg, #f0f4ff 0%, #e8f0fe 100%)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        style={{
          width: "100%", maxWidth: 420,
          background: "white",
          borderRadius: 20,
          boxShadow: "0 8px 40px rgba(6,46,113,0.14)",
          padding: "40px 36px 36px",
          border: "1px solid rgba(6,46,113,0.10)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <Link href="/ai-receptionist">
            <SiteMintLogo variant="dark" iconSize={32} />
          </Link>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", color: "#fff",
            background: "linear-gradient(135deg, #062e71 0%, #1249a8 100%)",
            padding: "2px 9px", borderRadius: 100,
          }}>
            AI Receptionist
          </span>
        </div>

        <h1 className="text-xl font-bold text-center mb-1" style={{ color: "#062e71" }}>
          Sign in to your account
        </h1>
        <p className="text-sm text-center text-muted-foreground mb-7">
          Don't have an account?{" "}
          <Link href="/ai-receptionist/signup" className="text-primary hover:underline font-medium">
            Get early access
          </Link>
        </p>

        {error && (
          <div className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="l-email" className="text-sm font-medium">Email</Label>
            <Input
              id="l-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              className="mt-1.5"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="l-password" className="text-sm font-medium">Password</Label>
            </div>
            <div className="relative">
              <Input
                id="l-password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2"
            style={{
              background: "linear-gradient(135deg, #062e71 0%, #0a3d91 100%)",
              color: "#fff", fontWeight: 700, height: 44,
              borderRadius: 10, border: "none",
              boxShadow: "0 2px 12px rgba(6,46,113,0.30)",
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
