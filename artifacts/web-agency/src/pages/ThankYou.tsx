import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Mail, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface ThankYouProps {
  formName?: string;
  email?: string;
}

export default function ThankYou({ formName, email }: ThankYouProps) {
  const [, navigate] = useLocation();
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(interval);
          navigate("/");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  const params = new URLSearchParams(window.location.search);
  const displayEmail = email || params.get("email") || "";
  const displayForm = formName || params.get("form") || "your inquiry";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-xl w-full text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <h1 className="text-4xl font-serif font-bold text-foreground mb-4">
          You're All Set!
        </h1>

        <p className="text-lg text-muted-foreground mb-3 leading-relaxed">
          Thank you! Your inquiry has been received. A confirmation email has been sent to your inbox.
        </p>

        {displayEmail && (
          <p className="text-sm text-muted-foreground mb-6">
            Confirmation sent to <span className="font-semibold text-foreground">{displayEmail}</span>
          </p>
        )}

        <div className="bg-card border border-border rounded-lg p-6 mb-8 text-left space-y-4">
          <h2 className="font-bold text-foreground text-base">What happens next?</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Our team reviews {displayForm} within 1 business day.</li>
            <li>We'll reach out to schedule a discovery call.</li>
            <li>We prepare a tailored proposal and timeline for your project.</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-4 h-4 text-primary" />
            <a href="tel:9498806515" className="hover:text-primary transition-colors font-medium">949-880-6515</a>
          </div>
          <div className="hidden sm:block text-muted-foreground">·</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="w-4 h-4 text-primary" />
            <a href="mailto:info.sitemint@gmail.com" className="hover:text-primary transition-colors font-medium">info.sitemint@gmail.com</a>
          </div>
        </div>

        <Button onClick={() => navigate("/")} className="gap-2 h-12 px-8">
          Back to Home <ArrowRight className="w-4 h-4" />
        </Button>

        <p className="text-xs text-muted-foreground mt-6">
          Redirecting to home in {seconds} second{seconds !== 1 ? "s" : ""}…
        </p>
      </motion.div>

      <div className="absolute bottom-6 left-0 right-0 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <div className="w-6 h-6 bg-foreground text-background text-xs font-bold rounded flex items-center justify-center">S</div>
          <span className="text-sm font-semibold">SiteMint Digital Solutions</span>
        </div>
      </div>
    </div>
  );
}
