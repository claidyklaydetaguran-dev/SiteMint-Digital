import { useState } from "react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
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
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const PAIN_POINTS = [
  {
    icon: "💸",
    title: "Leads cost $150–400+ and go cold within minutes",
    body: "The average online real estate lead expects a response in under 5 minutes. After that, conversion rates drop by over 80%. Your ad spend is burning cold.",
  },
  {
    icon: "⌛",
    title: "Most agents respond in hours, not seconds",
    body: "You're showing a home, on another call, or simply not available. Meanwhile, the lead has already booked a showing with the agent who texted them first.",
  },
  {
    icon: "🏡",
    title: "A missed follow-up is a client for a competing agent",
    body: "87% of buyer leads work with the first agent who responds. Every uncontacted Zillow lead is a commission check going to someone else.",
  },
];

interface FormState {
  name: string;
  brokerageName: string;
  email: string;
  phone: string;
  leadsPerMonth: string;
}

const empty: FormState = { name: "", brokerageName: "", email: "", phone: "", leadsPerMonth: "" };

export default function LandingRealtors() {
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const qs = new URLSearchParams(window.location.search);
      const r = await fetch("/api/landing-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical:     "realtors",
          name:         form.name,
          businessName: form.brokerageName,
          email:        form.email,
          phone:        form.phone,
          extra:        form.leadsPerMonth,
          utmSource:    qs.get("utm_source")   ?? "direct",
          utmMedium:    qs.get("utm_medium")   ?? "direct",
          utmCampaign:  qs.get("utm_campaign") ?? null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Submission failed — please try again."); return; }
      setSuccess(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ── Minimal header ── */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <SiteMintLogo variant="dark" iconSize={28} />
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="bg-[#0c2340] text-white px-6 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
            AI Follow-Up for Realtors &amp; Teams
          </span>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">
            The Agent Who Calls Back First Wins the Client. Every Time.
          </h1>
          <p className="text-base md:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            AI that texts and calls every new lead within 60 seconds — from Zillow, Facebook, or your
            own site — qualifies them, and books the showing before you've finished your coffee.
          </p>
          <a
            href="#cta"
            className="inline-block mt-4 px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Reserve Early Access →
          </a>
        </div>
      </section>

      {/* ── Pain points ── */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xl md:text-2xl font-bold mb-10 text-gray-800">
            Why agents lose leads they already paid for
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {PAIN_POINTS.map(p => (
              <div key={p.title} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="text-3xl mb-3">{p.icon}</div>
                <h3 className="font-bold text-gray-900 mb-2 text-sm md:text-base">{p.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA form ── */}
      <section id="cta" className="px-6 py-16">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900">
              Reserve early access
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Limited spots · No commitment · We'll reach out within 24 hours
            </p>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-lg font-bold text-emerald-800">We'll be in touch shortly!</p>
              <p className="text-sm text-emerald-700">
                Thanks for your interest. A member of our team will reach out within one business day.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
              <div>
                <Label htmlFor="name" className="text-sm font-semibold">Full Name *</Label>
                <Input id="name" value={form.name} onChange={set("name")} placeholder="Alex Johnson" className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="brokerageName" className="text-sm font-semibold">Brokerage / Team Name</Label>
                <Input id="brokerageName" value={form.brokerageName} onChange={set("brokerageName")} placeholder="Johnson Realty Group" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-semibold">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="alex@johnsonrealty.com" className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-semibold">Phone</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="leadsPerMonth" className="text-sm font-semibold">Approx. leads per month</Label>
                <Select value={form.leadsPerMonth} onValueChange={v => setForm(f => ({ ...f, leadsPerMonth: v }))}>
                  <SelectTrigger id="leadsPerMonth" className="mt-1 w-full">
                    <SelectValue placeholder="Select volume…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Under 20">Under 20</SelectItem>
                    <SelectItem value="20-50">20–50</SelectItem>
                    <SelectItem value="50-100">50–100</SelectItem>
                    <SelectItem value="100+">100+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Reserve My Spot
              </Button>
              <p className="text-[11px] text-gray-400 text-center">
                No spam. No sales pressure. Just a conversation.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 px-6 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} SiteMint Digital Solutions. All rights reserved.
      </footer>
    </div>
  );
}
