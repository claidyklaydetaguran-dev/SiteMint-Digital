import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetAiToolkitPurchase, getGetAiToolkitPurchaseQueryKey } from "@workspace/api-client-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Mail, ArrowRight } from "lucide-react";

export default function ThankYou() {
  const [location, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Extract session_id from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session_id");
    if (id) {
      setSessionId(id);
    } else {
      // If no session ID is found, redirect to home
      setLocation("/");
    }
  }, [setLocation]);

  // Poll for purchase delivery status
  const { data: purchaseStatus, isLoading, isError } = useGetAiToolkitPurchase(
    sessionId || "",
    {
      query: {
        enabled: !!sessionId,
        queryKey: getGetAiToolkitPurchaseQueryKey(sessionId || ""),
        refetchInterval: (query) => {
          const data = query.state.data;
          // Stop polling if delivered
          if (data?.delivered) return false;
          // Poll every 1.5 seconds while waiting
          return 1500;
        }
      }
    }
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] -z-10" />
      
      <div className="max-w-lg w-full bg-card border border-card-border p-8 md:p-12 rounded-3xl text-center shadow-2xl relative">
        <div className="flex justify-center mb-8">
          <SiteMintLogo iconSize={48} showText={false} />
        </div>

        {isError && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h1 className="text-2xl font-serif font-bold text-destructive">Something went wrong</h1>
            <p className="text-muted-foreground">We couldn't verify your purchase status. Please contact support if you were charged but didn't receive your toolkit.</p>
            <Button onClick={() => setLocation("/")} variant="outline" className="mt-4">
              Return Home
            </Button>
          </div>
        )}

        {!isError && (!purchaseStatus || !purchaseStatus.delivered) && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-pulse" />
              </div>
            </div>
            
            <h1 className="text-3xl font-serif font-bold text-foreground">Preparing your Toolkit</h1>
            <p className="text-muted-foreground text-lg">
              We're securely generating your access link and preparing the files for delivery.
            </p>
            <p className="text-sm text-muted-foreground/60 animate-pulse">
              This usually takes just a few seconds...
            </p>
          </div>
        )}

        {purchaseStatus?.delivered && (
          <div className="space-y-6 animate-in zoom-in-95 fade-in duration-700">
            <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
              <CheckCircle2 className="w-12 h-12 text-primary relative z-10" />
            </div>

            <h1 className="text-3xl md:text-4xl font-serif font-bold text-white">You're All Set!</h1>
            
            <div className="bg-accent/30 border border-accent rounded-xl p-6 my-8">
              <Mail className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="text-lg text-foreground mb-1">Your toolkit has been emailed to:</p>
              <p className="text-xl font-medium text-primary break-all">
                {purchaseStatus.email || "the email provided at checkout"}
              </p>
            </div>

            <p className="text-muted-foreground mb-8">
              Please check your inbox (and spam folder) for the download link. The email comes from <strong className="text-foreground">SiteMint Digital</strong>.
            </p>

            <Button 
              onClick={() => setLocation("/")}
              variant="outline"
              className="w-full font-medium"
            >
              Return to Website
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
