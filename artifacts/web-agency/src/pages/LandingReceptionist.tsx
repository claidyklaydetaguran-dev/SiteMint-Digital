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
    icon: "📵",
    title: "Businesses miss 60–80% of inbound calls",
    body: "When you're on a job, between jobs, or simply busy, your phone goes to voicemail. Most callers don't leave a message — they just call the next result on Google.",
  },
  {
    icon: "🔧",
    title: "Every missed call is a missed job",
    body: "A single missed plumbing, HVAC, or cleaning job can cost $300–2,000+. At just a few missed calls per month, that's a significant revenue leak you've normalized.",
  },
  {
    icon: "💰",
    title: "A human receptionist costs $2,800–4,500/month — this doesn't",
    body: "AI answers instantly 24/7, texts the caller back, handles basic questions, and books the appointment — at a fraction of the cost of even a part-time hire.",
  },
];

interface FormState {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
}

const empty: FormState = { name: "", businessName: "", email: "", phone: "", businessType: "" };

export default function LandingReceptionist() {
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
      const r = await fetch("/api/landing-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical:     "receptionist",
          name:         form.name,
          businessName: form.businessName,
          email:        form.email,
          phone:        form.phone,
          extra:        form.businessType,
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
      <section className="bg-[#1a1a2e] text-white px-6 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 rounded-full">
            AI Receptionist for Local Businesses
          </span>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">
            You're Losing Jobs to Voicemail. Stop.
          </h1>
          <p className="text-base md:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            When you miss a call, this AI answers instantly by text, answers basic questions, and books
            the appointment — so a busy signal never costs you a job again.
          </p>
          <a
            href="#cta"
            className="inline-block mt-4 px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Join the Waitlist →
          </a>
        </div>
      </section>

      {/* ── Pain points ── */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xl md:text-2xl font-bold mb-10 text-gray-800">
            The calls you miss are the jobs you never know you lost
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
              Join the waitlist
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Early access pricing · No commitment · We'll reach out within 24 hours
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
                <Input id="name" value={form.name} onChange={set("name")} placeholder="Chris Rivera" className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="businessName" className="text-sm font-semibold">Business Name</Label>
                <Input id="businessName" value={form.businessName} onChange={set("businessName")} placeholder="Rivera Plumbing &amp; Heating" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-semibold">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="chris@riveraplumbing.com" className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-semibold">Phone</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 000-0000" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="businessType" className="text-sm font-semibold">Business type</Label>
                <Select value={form.businessType} onValueChange={v => setForm(f => ({ ...f, businessType: v }))}>
                  <SelectTrigger id="businessType" className="mt-1 w-full">
                    <SelectValue placeholder="Select your industry…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Home Services">Home Services (HVAC, Plumbing, Electrical…)</SelectItem>
                    <SelectItem value="Salon/Spa">Salon / Spa / Beauty</SelectItem>
                    <SelectItem value="Medical/Dental">Medical / Dental / Chiropractic</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Join the Waitlist
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
