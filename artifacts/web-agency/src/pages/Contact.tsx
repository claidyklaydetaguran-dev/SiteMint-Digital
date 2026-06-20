import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Valid phone number required"),
  businessType: z.string().min(2, "Business type is required"),
  serviceNeeded: z.string().min(1, "Please select a service"),
  budgetRange: z.string().min(1, "Please select a budget range"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export default function Contact() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      businessType: "",
      serviceNeeded: "",
      budgetRange: "",
      message: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) throw new Error("Submission failed");

      navigate(`/thank-you?form=your+contact+inquiry&email=${encodeURIComponent(values.email)}`);
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again or email us directly at info.sitemint@gmail.com",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full pb-24">
      <section className="pt-20 pb-16 bg-accent/30 border-b border-border/40">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl font-serif font-bold text-foreground mb-6">Let's Build Together.</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Ready to upgrade your digital presence? Fill out the form below and we'll be in touch to schedule a free, no-obligation technical consultation.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-[1fr_400px] gap-16">
            <div>
              <div className="bg-card border border-border p-8 rounded-lg shadow-sm">
                <h2 className="text-2xl font-serif font-bold mb-8">Project Inquiry</h2>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Full Name</FormLabel>
                          <FormControl><Input placeholder="Jane Doe" className="h-12 bg-background" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Email Address</FormLabel>
                          <FormControl><Input placeholder="jane@company.com" className="h-12 bg-background" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Phone Number</FormLabel>
                          <FormControl><Input placeholder="(555) 123-4567" className="h-12 bg-background" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="businessType" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Business Type / Industry</FormLabel>
                          <FormControl><Input placeholder="e.g. Real Estate, Law Firm" className="h-12 bg-background" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="serviceNeeded" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Primary Service Needed</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12 bg-background"><SelectValue placeholder="Select a service" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="website">Website Design & Dev</SelectItem>
                              <SelectItem value="webapp">Custom Web Application</SelectItem>
                              <SelectItem value="seo">SEO Foundation</SelectItem>
                              <SelectItem value="automation">Business Automation</SelectItem>
                              <SelectItem value="other">Other / Not Sure</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="budgetRange" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Estimated Budget</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12 bg-background"><SelectValue placeholder="Select budget range" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="under5k">Under $5,000</SelectItem>
                              <SelectItem value="5k-10k">$5,000 - $10,000</SelectItem>
                              <SelectItem value="10k-25k">$10,000 - $25,000</SelectItem>
                              <SelectItem value="over25k">$25,000+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="message" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Project Details</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Tell us about your goals, current challenges, and timeline..." className="min-h-[150px] resize-y bg-background" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <Button type="submit" size="lg" className="w-full h-14 text-base" disabled={submitting} data-testid="button-submit-contact">
                      {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Send Message"}
                    </Button>
                  </form>
                </Form>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-serif font-bold mb-6">Contact Information</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 text-muted-foreground">
                    <Mail className="w-6 h-6 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground mb-1">Email Us</div>
                      <a href="mailto:info.sitemint@gmail.com" className="hover:text-primary transition-colors">info.sitemint@gmail.com</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 text-muted-foreground">
                    <Phone className="w-6 h-6 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground mb-1">Call Us</div>
                      <a href="tel:9498806515" className="hover:text-primary transition-colors">949-880-6515</a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 p-6 rounded-lg border border-primary/10">
                <h4 className="font-bold text-foreground mb-2">What happens next?</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>We review your inquiry within 24 hours.</li>
                  <li>We'll schedule a 30-minute discovery call.</li>
                  <li>We provide a detailed proposal and timeline.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
