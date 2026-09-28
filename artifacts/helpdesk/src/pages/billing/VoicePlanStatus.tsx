/**
 * J7 — the receptionist plan's real state, from `GET /receptionist/account/subscription`.
 *
 * The legacy trial/paid label below it describes text-message conversations.
 * This block is what decides whether the receptionist may run: active, a
 * failed payment inside its grace period, paused after grace ran out,
 * cancelled, or not activated. Each state says what happens and what to do.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bot, FlaskConical, ListChecks, Phone, CreditCard, ShieldCheck, ArrowRight, BarChart3, CheckCircle2 } from "lucide-react";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { InlineError } from "@/components/common/InlineError";
import { voicePlanStatusCopy, type VoiceSubscriptionView } from "@/pages/billing/billingContract";

async function fetchSubscription(): Promise<VoiceSubscriptionView> {
  const res = await fetch("/api/receptionist/account/subscription", { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  return (await res.json()) as VoiceSubscriptionView;
}

export function VoicePlanStatus() {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery<VoiceSubscriptionView>({
    queryKey: ["billing", "voice-subscription", firmId ?? "unresolved"],
    queryFn: fetchSubscription,
    enabled: firmId !== undefined,
  });

  if (query.isLoading) {
    return <p className="sd-sr" role="status" aria-live="polite">Checking your receptionist plan…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <InlineError
        title="Your receptionist plan couldn't be checked"
        description="This is a failed read, not a change to your plan. Try again."
        onRetry={() => void query.refetch()}
      />
    );
  }
  const copy = voicePlanStatusCopy(query.data);
  return <div className="cf-billing-grid">
  <section className="cf-current-plan cl-card"><h2>Current plan</h2><div><span className="cl-round"><Bot size={27}/></span><div><h3>{copy.title}</h3><p>{copy.detail}</p><span className="cl-pill cl-pill--neutral">{query.data.serviceAccess === 'active' ? 'Live service active' : 'Activation required'}</span></div><a className="cl-button" href="#billing-options">View plan details <ArrowRight size={16}/></a></div></section>
  <section className="cl-card"><h2>Included now</h2>{[[ListChecks,'Business setup','Your business details and preferences.'],[Bot,'Assistant draft','Shape how your assistant represents you.'],[FlaskConical,'Simulated demo','Try a scripted walkthrough before activation.']].map(([Icon,title,detail])=>{const Glyph=Icon as typeof Bot;return <div className="cf-benefit" key={String(title)}><span className="cl-round"><Glyph size={21}/></span><div><h3>{String(title)}</h3><p>{String(detail)}</p></div><CheckCircle2 size={18} className="cf-check"/></div>})}</section>
  <section className="cl-card"><h2>Activate live service</h2>{[[CreditCard,'Review subscription','Review the plan and activation requirements.','/account/billing#billing-options'],[Phone,'Connect number','Set up your business phone connection.','/channels/phone-number'],[ShieldCheck,'Complete activation checks','Verify setup before taking live calls.','/setup']].map(([Icon,title,detail,href],i)=>{const Glyph=Icon as typeof Bot;return <Link className="cf-benefit" href={String(href)} key={String(title)}><span className="cf-step">{i+1}</span><span className="cl-round cl-round--blue"><Glyph size={21}/></span><div><h3>{String(title)}</h3><p>{String(detail)}</p></div></Link>})}</section>
  <section className="cl-card"><h2>Usage summary</h2><div className="cf-benefit"><span className="cl-round cl-round--blue"><BarChart3 size={24}/></span><div><h3>Call and message activity</h3><p>Review recorded usage and account limits.</p><Link href="/account/usage">View usage <ArrowRight size={14}/></Link></div></div></section>
  <section className="cl-card"><h2>Billing details</h2><div className="cf-benefit"><span className="cl-round cl-round--blue"><CreditCard size={24}/></span><div><h3>{query.data.subscription ? 'Subscription on file' : 'No active subscription'}</h3><p>Review your account’s available billing options below.</p><a href="#billing-options">View billing options</a></div></div></section>
  </div>;
}
