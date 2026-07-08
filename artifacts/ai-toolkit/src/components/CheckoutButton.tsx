import { useState } from "react";
import { useCreateAiToolkitCheckout } from "@workspace/api-client-react";
import { Button, ButtonProps } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CheckoutButtonProps extends ButtonProps {
  children: React.ReactNode;
}

export function CheckoutButton({ children, className, ...props }: CheckoutButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const checkout = useCreateAiToolkitCheckout();
  const { toast } = useToast();

  const handleCheckout = async () => {
    try {
      setIsRedirecting(true);
      const data = await checkout.mutateAsync();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout failed",
        description: "There was an issue starting checkout. Please try again.",
        variant: "destructive"
      });
      setIsRedirecting(false);
    }
  };

  return (
    <Button 
      onClick={handleCheckout} 
      disabled={isRedirecting || checkout.isPending}
      className={className}
      {...props}
    >
      {isRedirecting || checkout.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Preparing Checkout...
        </>
      ) : (
        children
      )}
    </Button>
  );
}
