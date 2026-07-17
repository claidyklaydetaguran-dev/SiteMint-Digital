import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ReceptionistNav } from "@/components/layout/ReceptionistNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Loader2,
  ArrowLeft,
  Zap,
  MessageSquare,
  Users,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

const FEATURES = [
  { icon: Zap,           title: "Answers in seconds",      body: "The moment a customer texts or chats, they get a reply — not a voicemail, not silence." },
  { icon: MessageSquare, title: "Qualifies every caller",   body: "Asks the right questions for your business before your team ever picks up the phone." },
  { icon: Users,         title: "Keeps your team in sync", body: "Every conversation is logged. Nothing falls through the cracks, even on your busiest days." },
  { icon: ShieldCheck,   title: "Always on-brand",         body: "Consistent tone, your service list, your process — 24 hours a day, no off days." },
];

interface SignupState {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
  password: string;
}
const empty: SignupState = { name: "", businessName: "", email: "", phone: "", businessType: "", password: "" };

export default function LandingReceptionistSignup() {
  const [, navigate]    = useLocation();
  const [form, setForm] = useState<SignupState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");
  const [googleNote, setGoogleNote] = useState(false);
  const [showPw,     setShowPw]     = useState(false);

  const set = (k: keyof SignupState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!form.password.trim() || form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      // ── Real account creation ──────────────────────────────────────────────
      const r = await fetch("/api/receptionist/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName:     form.name,
          businessName: form.businessName,
          email:        form.email,
          phone:        form.phone,
          industry:     form.businessType,
          password:     form.password,
        }),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) { setError(d.error ?? "Signup failed — please try again."); return; }

      // ── Fire-and-forget lead capture (non-blocking) ─────────────────────
      void fetch("/api/landing-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical:     "receptionist",
          name:         form.name,
          businessName: form.businessName,
          email:        form.email,
          phone:        form.phone,
          extra:        { source: "get-early-access", businessType: form.businessType },
          utmSource:    new URLSearchParams(window.location.search).get("utm_source") ?? "direct",
          utmMedium:    new URLSearchParams(window.location.search).get("utm_medium") ?? "direct",
          utmCampaign:  new URLSearchParams(window.location.search).get("utm_campaign") ?? null,
        }),
      }).catch(() => {});

      window.location.href = "/ai-receptionist/dashboard/";
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden">
      <ReceptionistNav />
      {/* spacer for fixed nav */}
      <div className="h-[82px]" />

      <div className="min-h-[calc(100vh-82px)] flex flex-col md:flex-row">

        {/* ── Left — form ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col px-6 py-10 md:px-12 md:py-16 max-w-xl w-full mx-auto md:mx-0 md:max-w-none md:basis-[480px] md:shrink-0">
          {/* Back link */}
          <div className="flex items-center mb-10">
            <Link href="/ai-receptionist" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
          </div>

          {/* ── Form ── */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-8 space-y-1.5">
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground leading-tight">
                Get early access
              </h1>
              <p className="text-muted-foreground text-sm">
                Create your account — your AI receptionist will be configured personally by our team.
              </p>
            </div>

            {/* Google sign-in — honest "coming soon" */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setGoogleNote(true)}
                className="w-full flex items-center justify-center gap-3 border border-border rounded-xl py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2045C17.64 8.5663 17.5827 7.9527 17.4764 7.3636H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.2045Z" fill="#4285F4"/>
                  <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
                  <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.5931 3.68182 9C3.68182 8.4068 3.78409 7.8299 3.96409 7.2899V4.9581H0.957275C0.347727 6.1731 0 7.5477 0 9C0 10.4522 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
                  <path d="M9 3.5795C10.3214 3.5795 11.5077 4.0336 12.4405 4.9254L15.0218 2.344C13.4632 0.891772 11.4259 0 9 0C5.48182 0 2.43818 2.01681 0.957275 4.9581L3.96409 7.2899C4.67182 5.1627 6.65591 3.5795 9 3.5795Z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              {googleNote && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-xs text-muted-foreground mt-2 text-center px-2"
                >
                  Google sign-in is coming soon — please use the form below for now.
                </motion.p>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or create your account</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="s-name" className="text-sm font-semibold">Full name *</Label>
                  <Input id="s-name" value={form.name} onChange={set("name")} placeholder="Chris Rivera" className="mt-1.5" required />
                </div>
                <div>
                  <Label htmlFor="s-biz" className="text-sm font-semibold">Business name</Label>
                  <Input id="s-biz" value={form.businessName} onChange={set("businessName")} placeholder="Rivera Plumbing" className="mt-1.5" />
                </div>
              </div>

              <div>
                <Label htmlFor="s-email" className="text-sm font-semibold">Email *</Label>
                <Input id="s-email" type="email" value={form.email} onChange={set("email")} placeholder="chris@riveraplumbing.com" className="mt-1.5" autoComplete="email" required />
              </div>

              <div>
                <Label htmlFor="s-phone" className="text-sm font-semibold">Phone</Label>
                <Input id="s-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" className="mt-1.5" />
              </div>

              <div>
                <Label htmlFor="s-industry" className="text-sm font-semibold">Industry</Label>
                <Select value={form.businessType} onValueChange={(v) => setForm((f) => ({ ...f, businessType: v }))}>
                  <SelectTrigger id="s-industry" className="mt-1.5 w-full">
                    <SelectValue placeholder="Select your industry…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Real Estate">Real Estate</SelectItem>
                    <SelectItem value="Law Firm">Law Firm</SelectItem>
                    <SelectItem value="Home Services">Home Services (HVAC, Plumbing, Electrical…)</SelectItem>
                    <SelectItem value="Med Spa">Med Spa / Aesthetics</SelectItem>
                    <SelectItem value="Restaurant">Restaurant</SelectItem>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="s-password" className="text-sm font-semibold">Password *</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="s-password"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
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

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 rounded-xl"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating account…</>
                  : "Create account & get access"}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                Already have an account?{" "}
                <Link href="/ai-receptionist/dashboard/login" className="text-primary hover:underline">Sign in</Link>
              </p>
            </form>
          </div>
        </div>

        {/* ── Right — navy brand panel ────────────────────────────────────── */}
        <div className="hidden md:flex flex-1 bg-primary text-primary-foreground flex-col justify-center px-12 py-16 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px), radial-gradient(circle at 70% 80%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

          <div className="relative space-y-10 max-w-md">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-foreground/50">AI Receptionist</p>
              <h2 className="font-serif text-3xl md:text-4xl font-bold leading-tight">
                Never miss a<br />customer moment.
              </h2>
              <p className="text-primary-foreground/65 text-sm leading-relaxed">
                An AI receptionist that works exactly the way your business does —
                configured by us, reviewed by you, running 24/7.
              </p>
            </div>

            <div className="space-y-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-4 bg-white/8 rounded-xl p-4 border border-white/10">
                  <div className="w-8 h-8 rounded-lg bg-white/12 flex items-center justify-center shrink-0 mt-0.5">
                    <f.icon className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5">{f.title}</p>
                    <p className="text-xs text-primary-foreground/60 leading-relaxed">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-primary-foreground/35">
              SiteMint Digital · info.sitemint@gmail.com
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
