import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

import { useSession, SESSION_KEY } from "@/hooks/useSession";
import type { SessionFirm } from "@/hooks/useSession";
import {
  CreditCard,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Clock,
  Star,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function Billing() {
  const { data: me, isLoading } = useSession();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") !== "1") return;
    window.history.replaceState({}, "", window.location.pathname);
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      if (attempts >= 5) clearInterval(poll);
    }, 2000);
    return () => clearInterval(poll);
  }, [qc]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    setUpgradeError("");
    setNotConfigured(false);
    try {
      const res = await fetch("/api/receptionist/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error?.toLowerCase().includes("not configured")) {
        setNotConfigured(true);
      } else {
        setUpgradeError(data.error ?? "Failed to start checkout");
      }
    } catch {
      setUpgradeError("Failed to start checkout. Please try again.");
    } finally {
      setUpgrading(false);
    }
  };

  if (isLoading || !me) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { firm, conversationCount } = me;
  const isPaid = firm.planTier === "paid";
  const trialLimit = firm.trialConversationsLimit;
  const usagePct = Math.min(100, Math.round((conversationCount / trialLimit) * 100));

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your plan and usage</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="plan" className="h-full flex flex-col">
          <div className="px-6 border-b border-border bg-card">
            <TabsList className="h-10 bg-transparent border-0 p-0 gap-6">
              <TabsTrigger
                value="plan"
                className="h-10 px-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent text-muted-foreground text-sm font-medium"
              >
                Plan
              </TabsTrigger>
              <TabsTrigger
                value="usage"
                className="h-10 px-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent text-muted-foreground text-sm font-medium"
              >
                Usage
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-auto">
            <TabsContent value="plan" className="mt-0">
              <PlanTab
                firm={firm}
                isPaid={isPaid}
                upgrading={upgrading}
                upgradeError={upgradeError}
                notConfigured={notConfigured}
                onUpgrade={handleUpgrade}
              />
            </TabsContent>
            <TabsContent value="usage" className="mt-0">
              <UsageTab
                conversationCount={conversationCount}
                trialLimit={trialLimit}
                usagePct={usagePct}
                isPaid={isPaid}
                onUpgrade={handleUpgrade}
                upgrading={upgrading}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function PlanTab({
  firm,
  isPaid,
  upgrading,
  upgradeError,
  notConfigured,
  onUpgrade,
}: {
  firm: SessionFirm;
  isPaid: boolean;
  upgrading: boolean;
  upgradeError: string;
  notConfigured: boolean;
  onUpgrade: () => void;
}) {
  return (
    <div className="p-6 max-w-2xl space-y-5">
      {isPaid ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900">Active Subscription</div>
            <p className="text-xs text-emerald-700 mt-0.5">
              Your AI Receptionist is fully active with no conversation limits.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-amber-900">Free Trial</span>
              <Badge className="bg-amber-200 text-amber-800 border-transparent text-xs">
                Active
              </Badge>
            </div>
            <p className="text-xs text-amber-700">
              You're on the free trial — upgrade to remove the conversation limit.
            </p>
          </div>
        </div>
      )}

      {!isPaid && (
        <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-surface-muted to-surface-muted p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-surface-muted flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Upgrade to Pro</h3>
              <p className="text-xs text-primary mt-0.5">
                Unlimited conversations, priority AI response, full history
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              "Unlimited conversations",
              "No trial cap",
              "Full conversation history",
              "Priority support",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-1.5 text-xs text-primary">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>
          {notConfigured && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2.5">
              <Clock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-900">Billing isn&apos;t live yet</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Contact us at{" "}
                  <a
                    href="mailto:hello@sitemint.com"
                    className="underline hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
                  >
                    hello@sitemint.com
                  </a>{" "}
                  to upgrade your account.
                </p>
              </div>
            </div>
          )}
          {upgradeError && !notConfigured && (
            <p className="text-xs text-rose-600 mb-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {upgradeError}
            </p>
          )}
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold h-10 gap-1.5"
            onClick={onUpgrade}
            disabled={upgrading}
          >
            {upgrading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Stripe…
              </>
            ) : (
              <>
                Upgrade Now <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mt-3">
            <CreditCard className="h-3 w-3" /> Secured by Stripe
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Account Details</h3>
        <div className="space-y-3">
          <DetailRow label="Business" value={firm.name} />
          <DetailRow label="Email" value={firm.email ?? "—"} />
          <DetailRow label="Plan" value={isPaid ? "Pro (Paid)" : "Free Trial"} />
          <DetailRow
            label="Trial limit"
            value={`${firm.trialConversationsLimit} conversations`}
          />
          <DetailRow
            label="Member since"
            value={new Date(firm.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function UsageTab({
  conversationCount,
  trialLimit,
  usagePct,
  isPaid,
  onUpgrade,
  upgrading,
}: {
  conversationCount: number;
  trialLimit: number;
  usagePct: number;
  isPaid: boolean;
  onUpgrade: () => void;
  upgrading: boolean;
}) {
  const isHigh = usagePct >= 80;

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-foreground">Conversation Usage</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isPaid
            ? "Unlimited — you are on a paid plan"
            : `Free trial: ${trialLimit} conversations included`}
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Conversations Used</span>
          <span
            className={`text-xs font-medium ${
              isPaid ? "text-emerald-600" : isHigh ? "text-rose-600" : "text-muted-foreground"
            }`}
          >
            {isPaid
              ? `${conversationCount} (unlimited)`
              : `${conversationCount} / ${trialLimit}`}
          </span>
        </div>
        <Progress
          value={isPaid ? 100 : usagePct}
          className={`h-2 ${
            isPaid
              ? "bg-emerald-100 [&>div]:bg-emerald-500"
              : isHigh
              ? "bg-rose-100 [&>div]:bg-rose-500"
              : "bg-muted [&>div]:bg-primary"
          }`}
        />
        {isHigh && !isPaid && (
          <p className="text-[10px] text-rose-500 mt-1 font-medium">
            Approaching trial limit — upgrade to keep receiving leads
          </p>
        )}
      </div>

      {!isPaid && (
        <div className="p-4 rounded-xl border border-primary/25 bg-surface-muted flex items-center gap-4">
          <Star className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-foreground mb-0.5">Remove the limit</div>
            <div className="text-primary">Upgrade to Pro for unlimited conversations.</div>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
            onClick={onUpgrade}
            disabled={upgrading}
          >
            {upgrading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Upgrade"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
