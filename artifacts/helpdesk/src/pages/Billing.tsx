import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Zap,
  Phone,
  Mail,
  MessageSquare,
  Users,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Clock,
  Star,
} from "lucide-react";

const TRIAL_DAYS_LEFT = 11;
const TRIAL_TOTAL = 14;
const TRIAL_END = "Jul 26, 2026";

export default function Billing() {
  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Billing</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your plan, seats, and usage</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="plan" className="h-full flex flex-col">
          <div className="px-6 border-b border-slate-200 bg-white">
            <TabsList className="h-10 bg-transparent border-0 p-0 gap-6">
              <TabsTrigger
                value="plan"
                className="h-10 px-0 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-slate-500 text-sm font-medium"
              >
                Plan
              </TabsTrigger>
              <TabsTrigger
                value="usage"
                className="h-10 px-0 rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent text-slate-500 text-sm font-medium"
              >
                Usage
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-auto">
            <TabsContent value="plan" className="h-full mt-0">
              <PlanTab />
            </TabsContent>
            <TabsContent value="usage" className="h-full mt-0">
              <UsageTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Plan Tab ─────────────────────────────────────────────────────────────────

function PlanTab() {
  const [seats, setSeats] = useState(3);
  const [creditPack, setCreditPack] = useState<"none" | "500" | "1000">("500");

  const seatPrice = 39;
  const creditPackPrice = creditPack === "none" ? 0 : creditPack === "500" ? 19 : 35;
  const total = seats * seatPrice + creditPackPrice;

  return (
    <div className="flex gap-6 p-6 min-h-full">
      {/* Left column */}
      <div className="flex-1 space-y-5 min-w-0">
        {/* Trial Banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-amber-900">Trial Period</span>
              <Badge className="bg-amber-200 text-amber-800 border-transparent text-xs">{TRIAL_DAYS_LEFT} days left</Badge>
            </div>
            <p className="text-xs text-amber-700">
              Your free trial ends on <strong>{TRIAL_END}</strong>. Upgrade before it expires to keep your data and history.
            </p>
            <div className="mt-2">
              <Progress value={(TRIAL_DAYS_LEFT / TRIAL_TOTAL) * 100} className="h-1.5 bg-amber-200 [&>div]:bg-amber-500" />
            </div>
          </div>
        </div>

        {/* Upgrade Banner */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-indigo-900">Upgrade to Pro</h3>
              <p className="text-xs text-indigo-700 mt-0.5">Unlock unlimited tickets, AI assistance, and advanced analytics</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              "Unlimited tickets",
              "AI reply suggestions",
              "Advanced analytics",
              "Custom SLA rules",
              "Priority support",
              "API access",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-1.5 text-xs text-indigo-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>
        </div>

        {/* Plan Details Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Plan Details</h3>
          <div className="space-y-3">
            <DetailRow label="Plan" value="Pro Trial" />
            <DetailRow label="Seats" value={`${seats} agents`} />
            <DetailRow label="Extra Credit Pack" value={creditPack === "none" ? "None" : `${creditPack} credits/mo`} />
            <DetailRow label="Team Number" value="+1 (415) 555-0192" />
          </div>
        </div>

        {/* Current Access */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Current Access</h3>
          <div className="grid grid-cols-2 gap-3">
            <AccessCard icon={Mail} label="Email Channel" status="Included" color="text-purple-600" bg="bg-purple-50" />
            <AccessCard icon={Phone} label="Phone & SMS" status="Trial" color="text-emerald-600" bg="bg-emerald-50" />
            <AccessCard icon={MessageSquare} label="Live Chat" status="Included" color="text-blue-600" bg="bg-blue-50" />
            <AccessCard icon={Sparkles} label="AI Assistance" status="50 credits" color="text-indigo-600" bg="bg-indigo-50" />
          </div>
          <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <strong className="text-slate-700">Trial phone:</strong> +1 (415) 555-0192 · 50 AI credits remaining · AI assistance active
          </div>
        </div>
      </div>

      {/* Right column — Checkout Card */}
      <div className="w-[300px] flex-shrink-0">
        <div className="sticky top-6 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-slate-900 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Your Order</h3>
            <p className="text-xs text-slate-400 mt-0.5">Billed monthly</p>
          </div>
          <div className="p-5 space-y-4">
            {/* Seat stepper */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-2">Agent Seats</label>
              <div className="flex items-center gap-3">
                <button
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-colors"
                  onClick={() => setSeats(Math.max(1, seats - 1))}
                  disabled={seats <= 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <span className="text-lg font-semibold text-slate-900 w-6 text-center">{seats}</span>
                <button
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-colors"
                  onClick={() => setSeats(seats + 1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-500 ml-1">${seatPrice}/seat/mo</span>
              </div>
            </div>

            {/* Credit pack */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-2">AI Credit Pack</label>
              <div className="space-y-1.5">
                {[
                  { value: "none" as const, label: "No extra credits", price: null },
                  { value: "500" as const, label: "500 credits / mo", price: "+$19/mo" },
                  { value: "1000" as const, label: "1,000 credits / mo", price: "+$35/mo" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                      creditPack === opt.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                    onClick={() => setCreditPack(opt.value)}
                  >
                    <span className="font-medium">{opt.label}</span>
                    {opt.price && <span className="text-slate-500">{opt.price}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Order summary */}
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <OrderLine label="Pro Plan" value={`$${seats * seatPrice}`} />
              <OrderLine label={`${seats} seat${seats !== 1 ? "s" : ""} × $${seatPrice}`} value="" muted />
              {creditPack !== "none" && (
                <OrderLine label={`${creditPack} AI credits`} value={`$${creditPackPrice}`} />
              )}
              <div className="border-t border-slate-200 pt-2 mt-2">
                <OrderLine label="Pay Today" value={`$${total}`} bold />
                <p className="text-[10px] text-slate-400 mt-1">Then ${total}/mo. Cancel anytime.</p>
              </div>
            </div>

            <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold h-10 gap-1.5">
              Continue to Payment <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
              <CreditCard className="h-3 w-3" /> Secured by Stripe
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function AccessCard({ icon: Icon, label, status, color, bg }: { icon: React.ElementType; label: string; status: string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3 flex items-center gap-2.5`}>
      <Icon className={`h-4 w-4 ${color} flex-shrink-0`} />
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-900 truncate">{label}</div>
        <div className={`text-[10px] font-medium ${color}`}>{status}</div>
      </div>
    </div>
  );
}

function OrderLine({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-xs text-slate-400" : "text-sm"}`}>
      <span className={muted ? "" : bold ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</span>
      {value && <span className={bold ? "font-bold text-slate-900 text-base" : "font-medium text-slate-900"}>{value}</span>}
    </div>
  );
}

// ─── Usage Tab ────────────────────────────────────────────────────────────────

const USAGE_ITEMS = [
  { label: "Tickets Created", used: 47, limit: 100, unit: "tickets" },
  { label: "AI Credits", used: 38, limit: 50, unit: "credits" },
  { label: "Agent Seats", used: 3, limit: 5, unit: "seats" },
  { label: "Storage", used: 1.2, limit: 5, unit: "GB" },
  { label: "Email Inboxes", used: 2, limit: 3, unit: "inboxes" },
];

function UsageTab() {
  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Monthly Usage</h2>
          <p className="text-xs text-slate-500 mt-0.5">Resets Aug 1, 2026</p>
        </div>
        <Badge className="bg-amber-100 text-amber-700 border-transparent">{TRIAL_DAYS_LEFT}d trial left</Badge>
      </div>
      <div className="space-y-5">
        {USAGE_ITEMS.map((item) => {
          const pct = Math.round((item.used / item.limit) * 100);
          const isHigh = pct >= 80;
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-900">{item.label}</span>
                <span className={`text-xs font-medium ${isHigh ? "text-rose-600" : "text-slate-500"}`}>
                  {item.used} / {item.limit} {item.unit}
                </span>
              </div>
              <Progress
                value={pct}
                className={`h-2 ${isHigh ? "bg-rose-100 [&>div]:bg-rose-500" : "bg-slate-100 [&>div]:bg-indigo-500"}`}
              />
              {isHigh && (
                <p className="text-[10px] text-rose-500 mt-1 font-medium">
                  Approaching limit · upgrade to increase
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl border border-indigo-200 bg-indigo-50 flex items-center gap-4">
        <Star className="h-5 w-5 text-indigo-500 flex-shrink-0" />
        <div className="flex-1 text-xs">
          <div className="font-semibold text-indigo-900 mb-0.5">Need more capacity?</div>
          <div className="text-indigo-700">Upgrade your plan or add an AI credit pack from the Plan tab.</div>
        </div>
        <Button size="sm" className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex-shrink-0">
          Upgrade
        </Button>
      </div>
    </div>
  );
}
