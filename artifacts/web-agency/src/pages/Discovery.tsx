import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ArrowRight, ArrowLeft, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormData {
  companyName: string; contactName: string; email: string; phone: string;
  websiteUrl: string; industry: string; businessLocation: string; yearsInBusiness: string;
  services: string[]; projectGoals: string[];
  hasWebsite: string; websiteLikes: string; websiteFrustrations: string;
  websiteMissing: string; customerSources: string[];
  topGoals: string; measureSuccess: string; successOutcome: string;
  whyNow: string; ifNothingChanges: string[]; biggestFrustration: string;
  frustrationEffect: string; solvePerfectly: string; successFeel: string[];
  homeRun: string; milestone: string;
  idealCustomer: string; problemSolved: string; whyChooseYou: string;
  competitors: string; websitesYouLike: string; websiteLikesReason: string;
  marketingFeatures: string[]; salesFeatures: string[]; membershipFeatures: string[];
  automationFeatures: string[]; otherFeatures: string[]; integrations: string[];
  existingAssets: string[]; contentSupport: string;
  timeline: string; launchDate: string;
  budget: string; decisionMaker: string; workedWithAgency: string; agencyExperience: string;
  whyNowProject: string; concerns: string; anythingElse: string;
}

const initial: FormData = {
  companyName: "", contactName: "", email: "", phone: "",
  websiteUrl: "", industry: "", businessLocation: "", yearsInBusiness: "",
  services: [], projectGoals: [],
  hasWebsite: "", websiteLikes: "", websiteFrustrations: "", websiteMissing: "", customerSources: [],
  topGoals: "", measureSuccess: "", successOutcome: "",
  whyNow: "", ifNothingChanges: [], biggestFrustration: "", frustrationEffect: "",
  solvePerfectly: "", successFeel: [], homeRun: "", milestone: "",
  idealCustomer: "", problemSolved: "", whyChooseYou: "", competitors: "",
  websitesYouLike: "", websiteLikesReason: "",
  marketingFeatures: [], salesFeatures: [], membershipFeatures: [],
  automationFeatures: [], otherFeatures: [], integrations: [],
  existingAssets: [], contentSupport: "",
  timeline: "", launchDate: "",
  budget: "", decisionMaker: "", workedWithAgency: "", agencyExperience: "",
  whyNowProject: "", concerns: "", anythingElse: "",
};

const TOTAL_STEPS = 11;

// ── Small reusable components ─────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-1">{msg}</p>;
}

function CheckItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left ${
        checked
          ? "border-primary bg-primary/5 text-primary"
          : "border-border bg-background text-foreground hover:border-primary/40"
      }`}
    >
      <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 transition-all ${
        checked ? "bg-primary border-primary" : "border-border"
      }`}>
        {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
      </div>
      {label}
    </button>
  );
}

function RadioItem({ label, value, current, onClick }: { label: string; value: string; current: string; onClick: () => void }) {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left ${
        selected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border bg-background text-foreground hover:border-primary/40"
      }`}
    >
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
        selected ? "border-primary" : "border-border"
      }`}>
        {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>
      {label}
    </button>
  );
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-serif font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground">{sub}</p>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-sm font-semibold mb-1.5 block">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}

// ── Section renderers ─────────────────────────────────────────────────────────

function S1({ d, u, e }: { d: FormData; u: (k: keyof FormData, v: unknown) => void; e: Record<string, string> }) {
  const industries = ["Real Estate", "Nonprofit", "Medical", "Restaurant", "Contractor", "E-commerce", "Professional Services", "Other"];
  return (
    <>
      <SectionHeader title="Business Information" sub="Tell us about your company so we can personalize your proposal." />
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Company Name" required error={e.companyName}>
          <Input value={d.companyName} onChange={ev => u("companyName", ev.target.value)} placeholder="Acme Corp" className="h-11" />
        </Field>
        <Field label="Contact Name" required error={e.contactName}>
          <Input value={d.contactName} onChange={ev => u("contactName", ev.target.value)} placeholder="Jane Doe" className="h-11" />
        </Field>
        <Field label="Email Address" required error={e.email}>
          <Input value={d.email} onChange={ev => u("email", ev.target.value)} placeholder="jane@company.com" type="email" className="h-11" />
        </Field>
        <Field label="Phone Number">
          <Input value={d.phone} onChange={ev => u("phone", ev.target.value)} placeholder="(949) 000-0000" type="tel" className="h-11" />
        </Field>
        <Field label="Current Website URL">
          <Input value={d.websiteUrl} onChange={ev => u("websiteUrl", ev.target.value)} placeholder="https://yoursite.com" className="h-11" />
        </Field>
        <Field label="Industry" required error={e.industry}>
          <select
            value={d.industry}
            onChange={ev => u("industry", ev.target.value)}
            className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select industry...</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Business Location">
          <Input value={d.businessLocation} onChange={ev => u("businessLocation", ev.target.value)} placeholder="City, State" className="h-11" />
        </Field>
        <Field label="Years in Business">
          <Input value={d.yearsInBusiness} onChange={ev => u("yearsInBusiness", ev.target.value)} placeholder="e.g. 3 years" className="h-11" />
        </Field>
      </div>
    </>
  );
}

function S2({ d, toggle, e }: { d: FormData; toggle: (k: keyof FormData, v: string) => void; e: Record<string, string> }) {
  const services = [
    ["new-website", "New Website"], ["redesign", "Website Redesign"], ["web-app", "Web Application"],
    ["crm", "CRM Development"], ["seo", "SEO Services"], ["blog", "Blog Content"],
    ["maintenance", "Maintenance & Support"], ["automation", "AI Automation"], ["consultation", "Consultation"],
  ];
  const goals = [
    ["leads", "Generate Leads"], ["sales", "Increase Sales"], ["brand", "Build Brand Awareness"],
    ["ux", "Improve User Experience"], ["automate", "Automate Processes"], ["payments", "Accept Online Payments"],
    ["appointments", "Book Appointments"], ["seo-rank", "Improve SEO Rankings"], ["launch", "Launch New Product/Service"],
  ];
  return (
    <>
      <SectionHeader title="Project Type" sub="What services are you looking for? Select all that apply." />
      <Field label="Services Interested In" required error={e.services}>
        <div className="grid sm:grid-cols-2 gap-2 mt-1">
          {services.map(([v, l]) => (
            <CheckItem key={v} label={l} checked={d.services.includes(v)} onClick={() => toggle("services", v)} />
          ))}
        </div>
      </Field>
      <div className="mt-6">
        <Field label="Primary Project Goals" >
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {goals.map(([v, l]) => (
              <CheckItem key={v} label={l} checked={d.projectGoals.includes(v)} onClick={() => toggle("projectGoals", v)} />
            ))}
          </div>
        </Field>
      </div>
    </>
  );
}

function S3({ d, u, toggle }: { d: FormData; u: (k: keyof FormData, v: unknown) => void; toggle: (k: keyof FormData, v: string) => void }) {
  const sources = [
    ["google", "Google Search"], ["referrals", "Referrals"], ["facebook", "Facebook"],
    ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["networking", "Networking"],
    ["paid-ads", "Paid Ads"], ["other", "Other"],
  ];
  return (
    <>
      <SectionHeader title="Current Situation" sub="Help us understand where you're starting from." />
      <div className="space-y-5">
        <Field label="Do you currently have a website?">
          <div className="flex gap-3 mt-1">
            {[["yes", "Yes"], ["no", "No"]].map(([v, l]) => (
              <RadioItem key={v} label={l} value={v} current={d.hasWebsite} onClick={() => u("hasWebsite", v)} />
            ))}
          </div>
        </Field>
        {d.hasWebsite === "yes" && <>
          <Field label="What do you like about your current website?">
            <Textarea value={d.websiteLikes} onChange={ev => u("websiteLikes", ev.target.value)} placeholder="What's working well?" className="min-h-[80px]" />
          </Field>
          <Field label="What frustrates you about your current website?">
            <Textarea value={d.websiteFrustrations} onChange={ev => u("websiteFrustrations", ev.target.value)} placeholder="What's not working?" className="min-h-[80px]" />
          </Field>
          <Field label="What do you believe is missing?">
            <Textarea value={d.websiteMissing} onChange={ev => u("websiteMissing", ev.target.value)} placeholder="Features, content, design..." className="min-h-[80px]" />
          </Field>
        </>}
        <Field label="How are customers currently finding you?">
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {sources.map(([v, l]) => (
              <CheckItem key={v} label={l} checked={d.customerSources.includes(v)} onClick={() => toggle("customerSources", v)} />
            ))}
          </div>
        </Field>
      </div>
    </>
  );
}

function S4({ d, u }: { d: FormData; u: (k: keyof FormData, v: unknown) => void }) {
  return (
    <>
      <SectionHeader title="Business Goals" sub="What does success look like for your business?" />
      <div className="space-y-5">
        <Field label="What are your top 3 business goals over the next 12 months?">
          <Textarea value={d.topGoals} onChange={ev => u("topGoals", ev.target.value)} placeholder="1. Grow revenue by 30%  2. Build online authority  3. ..." className="min-h-[100px]" />
        </Field>
        <Field label="How will you measure success?">
          <Textarea value={d.measureSuccess} onChange={ev => u("measureSuccess", ev.target.value)} placeholder="Leads per month, revenue, bookings..." className="min-h-[80px]" />
        </Field>
        <Field label="If this project is successful, what does that look like?">
          <Textarea value={d.successOutcome} onChange={ev => u("successOutcome", ev.target.value)} placeholder="Describe the ideal outcome..." className="min-h-[80px]" />
        </Field>
      </div>
    </>
  );
}

function S5({ d, u, toggle }: { d: FormData; u: (k: keyof FormData, v: unknown) => void; toggle: (k: keyof FormData, v: string) => void }) {
  const consequences = [
    ["lost-revenue", "Lost Revenue"], ["lost-opportunities", "Lost Opportunities"],
    ["falling-behind", "Falling Behind Competitors"], ["wasted-time", "Wasted Time"],
    ["poor-cx", "Poor Customer Experience"], ["team-inefficiency", "Team Inefficiencies"], ["other", "Other"],
  ];
  const feelings = [
    ["relief", "Relief"], ["confidence", "Confidence"], ["peace-of-mind", "Peace of Mind"],
    ["pride", "Pride"], ["excitement", "Excitement"], ["freedom", "Freedom"],
  ];
  return (
    <>
      <SectionHeader title="Emotional Drivers" sub="Help us understand what's driving this decision — so we can build the right solution." />
      <div className="space-y-5">
        <Field label="Why is solving this problem important to you right now?">
          <Textarea value={d.whyNow} onChange={ev => u("whyNow", ev.target.value)} placeholder="What's at stake for you personally or professionally?" className="min-h-[80px]" />
        </Field>
        <Field label="What happens if nothing changes over the next 6–12 months?">
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {consequences.map(([v, l]) => (
              <CheckItem key={v} label={l} checked={d.ifNothingChanges.includes(v)} onClick={() => toggle("ifNothingChanges", v)} />
            ))}
          </div>
        </Field>
        <Field label="What is your biggest frustration today?">
          <Textarea value={d.biggestFrustration} onChange={ev => u("biggestFrustration", ev.target.value)} placeholder="Be specific..." className="min-h-[80px]" />
        </Field>
        <Field label="How does that frustration affect your day-to-day operations?">
          <Textarea value={d.frustrationEffect} onChange={ev => u("frustrationEffect", ev.target.value)} placeholder="What does it cost you in time, money, or energy?" className="min-h-[80px]" />
        </Field>
        <Field label="If we solved this problem perfectly, what would that allow you to do?">
          <Textarea value={d.solvePerfectly} onChange={ev => u("solvePerfectly", ev.target.value)} placeholder="What becomes possible?" className="min-h-[80px]" />
        </Field>
        <Field label="What would success feel like personally?">
          <div className="grid sm:grid-cols-3 gap-2 mt-1">
            {feelings.map(([v, l]) => (
              <CheckItem key={v} label={l} checked={d.successFeel.includes(v)} onClick={() => toggle("successFeel", v)} />
            ))}
          </div>
        </Field>
        <Field label="What would make this project a 'home run' for you?">
          <Textarea value={d.homeRun} onChange={ev => u("homeRun", ev.target.value)} placeholder="What's the dream outcome?" className="min-h-[80px]" />
        </Field>
        <Field label="Is there a specific business milestone you are trying to reach?">
          <Input value={d.milestone} onChange={ev => u("milestone", ev.target.value)} placeholder="e.g. 50 leads/month, first $1M in revenue..." className="h-11" />
        </Field>
      </div>
    </>
  );
}

function S6({ d, u }: { d: FormData; u: (k: keyof FormData, v: unknown) => void }) {
  return (
    <>
      <SectionHeader title="Target Audience" sub="Tell us about your ideal customers and competitive landscape." />
      <div className="space-y-5">
        <Field label="Who is your ideal customer?">
          <Textarea value={d.idealCustomer} onChange={ev => u("idealCustomer", ev.target.value)} placeholder="Describe their age, industry, income level, needs..." className="min-h-[80px]" />
        </Field>
        <Field label="What problem do they have that you solve?">
          <Textarea value={d.problemSolved} onChange={ev => u("problemSolved", ev.target.value)} placeholder="What pain point do you address?" className="min-h-[80px]" />
        </Field>
        <Field label="Why do customers choose you over competitors?">
          <Textarea value={d.whyChooseYou} onChange={ev => u("whyChooseYou", ev.target.value)} placeholder="Your unique value proposition..." className="min-h-[80px]" />
        </Field>
        <Field label="Who are your biggest competitors?">
          <Input value={d.competitors} onChange={ev => u("competitors", ev.target.value)} placeholder="Competitor names or websites" className="h-11" />
        </Field>
        <Field label="List 3 websites you like (URLs or names)">
          <Input value={d.websitesYouLike} onChange={ev => u("websitesYouLike", ev.target.value)} placeholder="apple.com, airbnb.com, ..." className="h-11" />
        </Field>
        <Field label="What do you like about those websites?">
          <Textarea value={d.websiteLikesReason} onChange={ev => u("websiteLikesReason", ev.target.value)} placeholder="Design style, simplicity, copy, layout..." className="min-h-[80px]" />
        </Field>
      </div>
    </>
  );
}

function S7({ d, toggle }: { d: FormData; toggle: (k: keyof FormData, v: string) => void }) {
  const groups: [keyof FormData, string, [string, string][]][] = [
    ["marketingFeatures", "Marketing", [["lead-forms", "Lead Capture Forms"], ["contact-forms", "Contact Forms"], ["newsletter", "Newsletter Signup"], ["landing-pages", "Landing Pages"], ["blog", "Blog"]]],
    ["salesFeatures", "Sales", [["online-payments", "Online Payments"], ["product-catalog", "Product Catalog"], ["crm-integration", "CRM Integration"], ["appointment-scheduling", "Appointment Scheduling"]]],
    ["membershipFeatures", "Membership", [["user-login", "User Login"], ["member-dashboard", "Member Dashboard"], ["subscription-plans", "Subscription Plans"]]],
    ["automationFeatures", "Automation", [["email-automation", "Email Automation"], ["ai-chatbot", "AI Chatbot"], ["workflow-automation", "Workflow Automation"]]],
    ["otherFeatures", "Other", [["custom-functionality", "Custom Functionality"]]],
  ];
  const integrationOptions: [string, string][] = [
    ["google-calendar", "Google Calendar"], ["stripe", "Stripe"], ["paypal", "PayPal"],
    ["mailchimp", "Mailchimp"], ["follow-up-boss", "Follow Up Boss"], ["salesforce", "Salesforce"],
    ["hubspot", "HubSpot"], ["activecampaign", "ActiveCampaign"], ["other", "Other"],
  ];
  return (
    <>
      <SectionHeader title="Features & Functionality" sub="Select all features and integrations you may need." />
      <div className="space-y-6">
        {groups.map(([field, groupLabel, opts]) => (
          <div key={field}>
            <p className="text-sm font-semibold text-foreground mb-2">{groupLabel}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {opts.map(([v, l]) => (
                <CheckItem key={v} label={l} checked={(d[field] as string[]).includes(v)} onClick={() => toggle(field, v)} />
              ))}
            </div>
          </div>
        ))}
        <div>
          <p className="text-sm font-semibold text-foreground mb-2">Integrations Needed</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {integrationOptions.map(([v, l]) => (
              <CheckItem key={v} label={l} checked={d.integrations.includes(v)} onClick={() => toggle("integrations", v)} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function S8({ d, u, toggle }: { d: FormData; u: (k: keyof FormData, v: unknown) => void; toggle: (k: keyof FormData, v: string) => void }) {
  const assets: [string, string][] = [["logo", "Logo"], ["brand-guidelines", "Brand Guidelines"], ["photos", "Photos"], ["videos", "Videos"], ["content", "Website Content (copy)"]];
  const support: [string, string][] = [["provide-all", "I will provide everything"], ["need-some", "Need some assistance"], ["need-full", "Need full content creation"]];
  return (
    <>
      <SectionHeader title="Content & Branding" sub="Tell us what assets you already have and what you'll need help with." />
      <div className="space-y-5">
        <Field label="Which of these do you already have?">
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {assets.map(([v, l]) => (
              <CheckItem key={v} label={l} checked={d.existingAssets.includes(v)} onClick={() => toggle("existingAssets", v)} />
            ))}
          </div>
        </Field>
        <Field label="Will you provide content or would you like SiteMint to assist?">
          <div className="space-y-2 mt-1">
            {support.map(([v, l]) => (
              <RadioItem key={v} label={l} value={v} current={d.contentSupport} onClick={() => u("contentSupport", v)} />
            ))}
          </div>
        </Field>
      </div>
    </>
  );
}

function S9({ d, u }: { d: FormData; u: (k: keyof FormData, v: unknown) => void }) {
  const timelines: [string, string][] = [["asap", "ASAP"], ["30-days", "Within 30 Days"], ["60-days", "Within 60 Days"], ["90-days", "Within 90 Days"], ["flexible", "Flexible"]];
  return (
    <>
      <SectionHeader title="Timeline" sub="When do you need this completed?" />
      <div className="space-y-5">
        <Field label="When would you like this project completed?">
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {timelines.map(([v, l]) => (
              <RadioItem key={v} label={l} value={v} current={d.timeline} onClick={() => u("timeline", v)} />
            ))}
          </div>
        </Field>
        <Field label="Is there a specific launch date we should know about?">
          <Input value={d.launchDate} onChange={ev => u("launchDate", ev.target.value)} placeholder="e.g. January 1, 2025 — or leave blank" className="h-11" />
        </Field>
      </div>
    </>
  );
}

function S10({ d, u }: { d: FormData; u: (k: keyof FormData, v: unknown) => void }) {
  const budgets: [string, string][] = [["under1k", "Under $1,000"], ["1k-2.5k", "$1,000 – $2,500"], ["2.5k-5k", "$2,500 – $5,000"], ["5k-10k", "$5,000 – $10,000"], ["10k-plus", "$10,000+"]];
  const decisions: [string, string][] = [["just-me", "Just Me"], ["business-partner", "Business Partner"], ["board", "Board of Directors"], ["marketing-team", "Marketing Team"], ["other", "Other"]];
  return (
    <>
      <SectionHeader title="Budget & Decision Making" sub="Help us recommend the right package for your needs." />
      <div className="space-y-5">
        <Field label="Estimated Project Budget">
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {budgets.map(([v, l]) => (
              <RadioItem key={v} label={l} value={v} current={d.budget} onClick={() => u("budget", v)} />
            ))}
          </div>
        </Field>
        <Field label="Who is involved in the decision?">
          <div className="grid sm:grid-cols-2 gap-2 mt-1">
            {decisions.map(([v, l]) => (
              <RadioItem key={v} label={l} value={v} current={d.decisionMaker} onClick={() => u("decisionMaker", v)} />
            ))}
          </div>
        </Field>
        <Field label="Have you worked with a website or software company before?">
          <div className="flex gap-3 mt-1">
            {[["yes", "Yes"], ["no", "No"]].map(([v, l]) => (
              <RadioItem key={v} label={l} value={v} current={d.workedWithAgency} onClick={() => u("workedWithAgency", v)} />
            ))}
          </div>
        </Field>
        {d.workedWithAgency === "yes" && (
          <Field label="What was your experience like?">
            <Textarea value={d.agencyExperience} onChange={ev => u("agencyExperience", ev.target.value)} placeholder="What went well or poorly?" className="min-h-[80px]" />
          </Field>
        )}
      </div>
    </>
  );
}

function S11({ d, u }: { d: FormData; u: (k: keyof FormData, v: unknown) => void }) {
  return (
    <>
      <SectionHeader title="Final Questions" sub="A few last things to help us prepare your proposal." />
      <div className="space-y-5">
        <Field label="Why are you looking to start this project now?">
          <Textarea value={d.whyNowProject} onChange={ev => u("whyNowProject", ev.target.value)} placeholder="What triggered this decision?" className="min-h-[80px]" />
        </Field>
        <Field label="What concerns do you have about hiring a website or software company?">
          <Textarea value={d.concerns} onChange={ev => u("concerns", ev.target.value)} placeholder="Be honest — we want to address these upfront." className="min-h-[80px]" />
        </Field>
        <Field label="Is there anything else we should know?">
          <Textarea value={d.anythingElse} onChange={ev => u("anythingElse", ev.target.value)} placeholder="Anything important we haven't asked about?" className="min-h-[100px]" />
        </Field>
      </div>
    </>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-xl text-center"
      >
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-4">Thank You!</h1>
        <p className="text-muted-foreground text-lg leading-relaxed mb-8">
          Thank you for completing the SiteMint Discovery Form. Our team will review your answers and prepare a recommended scope of work and project proposal within 24–48 hours.
        </p>
        <div className="bg-accent/40 rounded-xl p-6 mb-8 text-left border border-border/50">
          <p className="text-sm font-semibold text-foreground mb-3">What happens next?</p>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Our team reviews your discovery form answers</li>
            <li>We prepare a personalized scope of work and proposal</li>
            <li>We reach out within 24–48 hours to schedule a discovery call</li>
          </ol>
        </div>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/">
            <Button variant="outline" size="lg">Back to Home</Button>
          </Link>
          <a href="mailto:info.sitemint@gmail.com">
            <Button size="lg">Email Us Directly</Button>
          </a>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const sectionTitles = [
  "Business Information", "Project Type", "Current Situation", "Business Goals",
  "Emotional Drivers", "Target Audience", "Features & Functionality",
  "Content & Branding", "Timeline", "Budget & Decision Making", "Final Questions",
];

export default function Discovery() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const update = (key: keyof FormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[key as string]; return n; });
  };

  const toggle = (key: keyof FormData, value: string) => {
    const arr = (formData[key] as string[]) || [];
    update(key, arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!formData.companyName.trim()) errs.companyName = "Company name is required";
      if (!formData.contactName.trim()) errs.contactName = "Contact name is required";
      if (!formData.email.includes("@")) errs.email = "Valid email is required";
      if (!formData.industry) errs.industry = "Please select your industry";
    }
    if (step === 1) {
      if (formData.services.length === 0) errs.services = "Please select at least one service";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [, navigate] = useLocation();

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/discovery/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Submission failed");
      navigate(`/thank-you?form=your+discovery+form&email=${encodeURIComponent(formData.email)}`);
    } catch {
      setSubmitError("Something went wrong. Please try again or email us at info.sitemint@gmail.com.");
      setSubmitting(false);
    }
  };

  if (done) return <SuccessScreen />;

  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const props = { d: formData, u: update, toggle, e: errors };

  const sections = [
    <S1{...props} />, <S2 {...props} />, <S3 {...props} />, <S4 {...props} />,
    <S5 {...props} />, <S6 {...props} />, <S7 {...props} />, <S8 {...props} />,
    <S9 {...props} />, <S10 {...props} />, <S11 {...props} />,
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="bg-foreground text-background sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-background text-foreground rounded-sm flex items-center justify-center font-serif font-bold text-lg">S</div>
            <span className="font-serif font-semibold text-base text-background hidden sm:block">SiteMint Digital</span>
          </Link>
          <div className="flex-1 max-w-md">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-background/60">Step {step + 1} of {TOTAL_STEPS}</span>
              <span className="text-xs text-background/60">{sectionTitles[step]}</span>
            </div>
            <div className="w-full bg-background/20 rounded-full h-1.5">
              <div className="bg-background rounded-full h-1.5 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ClipboardList className="w-4 h-4 text-background/60" />
            <span className="text-xs text-background/60">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      {/* Intro banner (step 0 only) */}
      {step === 0 && (
        <div className="bg-accent/30 border-b border-border/40 py-8">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="text-3xl font-serif font-bold text-foreground mb-3">SiteMint Discovery Form</h1>
            <p className="text-muted-foreground leading-relaxed">
              Tell us about your business, your goals, and what you want your website or digital system to do for you. This form helps our team understand not just what you need built, but <em>why it matters</em> — so we can recommend the right scope, timeline, and investment for your project.
            </p>
          </div>
        </div>
      )}

      {/* Form content */}
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {sections[step]}
          </motion.div>
        </AnimatePresence>

        {submitError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/40">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={handleBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {step + 1} / {TOTAL_STEPS}
            </span>
            {step < TOTAL_STEPS - 1 ? (
              <Button onClick={handleNext} className="gap-2">
                Next Section <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2 h-12 px-8">
                {submitting ? "Submitting..." : "Submit My Discovery Form"} {!submitting && <ArrowRight className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
