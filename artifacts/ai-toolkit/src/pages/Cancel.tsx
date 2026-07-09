import React from "react";
import { useLocation } from "wouter";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertCircle } from "lucide-react";

export default function Cancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
      
      <div className="max-w-md w-full bg-card/50 backdrop-blur-xl border border-card-border p-8 md:p-12 rounded-3xl text-center space-y-6 shadow-2xl">
        <div className="flex justify-center mb-6">
          <SiteMintLogo iconSize={40} showText={false} />
        </div>
        
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto text-muted-foreground mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h1 className="text-3xl font-serif font-bold text-foreground">Checkout Incomplete</h1>
        
        <p className="text-muted-foreground text-lg">
          No worries! Your order hasn't been placed and you haven't been charged.
        </p>

        <p className="text-sm text-muted-foreground/80">
          If you have questions about the toolkit, feel free to reach out. Otherwise, you can head back to see what's included.
        </p>

        <div className="pt-8">
          <Button 
            onClick={() => setLocation("/")}
            size="lg"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-14"
          >
            Return to Toolkit Details
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
