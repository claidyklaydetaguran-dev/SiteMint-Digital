import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function Pricing() {
  return (
    <div className="w-full pb-24">
      <section className="pt-20 pb-16 bg-accent/30">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-5xl font-serif font-bold text-foreground mb-6">Transparent Pricing</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Clear investments for clear returns. We structure our pricing to provide maximum value at every stage of your business growth.
            </p>
          </motion.div>
        </div>
      </section>
      
      {/* Website Tiers */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4">Website Packages</h2>
            <p className="text-muted-foreground">Professional foundations for marketing and lead generation.</p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                title: "Starter Website",
                price: "2,500",
                description: "Essential presence for new or local businesses.",
                features: ["1–3 pages", "Mobile responsive design", "Standard contact form", "Basic SEO setup", "Launch support"],
                popular: false
              },
              {
                title: "Growth Website",
                price: "5,000",
                description: "Comprehensive site designed to capture leads.",
                features: ["5–8 pages", "Detailed service pages", "Advanced lead capture", "SEO foundation", "Blog CMS setup", "Analytics integration"],
                popular: true
              },
              {
                title: "Premium Business",
                price: "8,500",
                description: "Advanced marketing machine for established brands.",
                features: ["8–12 pages", "Custom animated sections", "Advanced service landing pages", "Full blog system", "Local SEO optimization", "CRM/email integration", "30 days post-launch support"],
                popular: false
              }
            ].map((tier, i) => (
              <Card key={i} className={`relative flex flex-col ${tier.popular ? 'border-primary shadow-lg lg:-translate-y-4 lg:scale-105 z-10 bg-card' : 'border-border bg-card/50'}`}>
                {tier.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm">
                    Recommended
                  </div>
                )}
                <CardHeader className="text-center pb-8 pt-8">
                  <CardTitle className="text-2xl font-serif mb-2">{tier.title}</CardTitle>
                  <CardDescription className="h-10">{tier.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow text-center pb-8">
                  <div className="mb-8">
                    <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Starting at</span>
                    <div className="text-5xl font-bold mt-2 text-foreground">${tier.price}</div>
                  </div>
                  <ul className="space-y-4 text-sm text-left">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0" /> 
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="pt-0 pb-8 px-8">
                  <Link href="/contact" className="w-full">
                    <Button className="w-full h-12 text-base" variant={tier.popular ? 'default' : 'outline'}>
                      Book a Consultation
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Web App Packages */}
      <section className="py-20 bg-accent/30 border-y border-border/40">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-serif font-bold mb-4">Web Application Packages</h2>
              <p className="text-muted-foreground">Custom software solutions to run your operations.</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-xl font-serif">Web App Starter</CardTitle>
                  <CardDescription>Internal tools and simple portals.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <span className="text-sm text-muted-foreground">Starting at</span>
                    <div className="text-3xl font-bold mt-1 text-foreground">$12,000</div>
                  </div>
                  <ul className="space-y-3 text-sm">
                    {["Secure login system", "User dashboard", "Core database setup", "Basic admin controls", "Standard workflow automation"].map((f, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href="/contact" className="w-full">
                    <Button variant="outline" className="w-full">Book a Consultation</Button>
                  </Link>
                </CardFooter>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-xl font-serif">Custom Business Web App</CardTitle>
                  <CardDescription>Complex platforms tailored to your exact needs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <span className="text-sm text-muted-foreground">Starting at</span>
                    <div className="text-3xl font-bold mt-1 text-foreground">$25,000</div>
                  </div>
                  <ul className="space-y-3 text-sm">
                    {["Custom user roles & permissions", "CRM-style data dashboards", "Complex booking & scheduling", "Real-time notifications", "Advanced database management", "Scalable cloud architecture"].map((f, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href="/contact" className="w-full">
                    <Button className="w-full">Book a Consultation</Button>
                  </Link>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Add-on Packages */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-serif font-bold mb-4">Add-ons & Ongoing Support</h2>
            <p className="text-muted-foreground">Enhance your digital system and keep it running smoothly.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {/* SEO */}
            <div>
              <h3 className="text-xl font-serif font-bold mb-6 flex items-center gap-2 border-b border-border pb-4">
                SEO Packages
              </h3>
              <ul className="space-y-6">
                <li>
                  <div className="font-semibold mb-1">SEO Foundation</div>
                  <div className="text-sm text-muted-foreground">One-time comprehensive audit and structural setup.</div>
                </li>
                <li>
                  <div className="font-semibold mb-1">Local SEO Boost</div>
                  <div className="text-sm text-muted-foreground">Google Business optimization and local citation building.</div>
                </li>
                <li>
                  <div className="font-semibold mb-1">Monthly SEO Support</div>
                  <div className="text-sm text-muted-foreground">Ongoing keyword tracking, optimization, and reporting.</div>
                </li>
              </ul>
            </div>

            {/* Blog */}
            <div>
              <h3 className="text-xl font-serif font-bold mb-6 flex items-center gap-2 border-b border-border pb-4">
                Blog Support
              </h3>
              <ul className="space-y-6">
                <li>
                  <div className="font-semibold mb-1">Blog Starter</div>
                  <div className="text-sm text-muted-foreground">Initial CMS configuration, categories, and 3 starter posts.</div>
                </li>
                <li>
                  <div className="font-semibold mb-1">Monthly Blog Support</div>
                  <div className="text-sm text-muted-foreground">Content planning, SEO outlines, and uploading 2-4 posts/month.</div>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h3 className="text-xl font-serif font-bold mb-6 flex items-center gap-2 border-b border-border pb-4">
                Ongoing Care
              </h3>
              <ul className="space-y-6">
                <li>
                  <div className="font-semibold mb-1">Basic Care</div>
                  <div className="text-sm text-muted-foreground">Security updates, uptime monitoring, and daily backups.</div>
                </li>
                <li>
                  <div className="font-semibold mb-1">Growth Care</div>
                  <div className="text-sm text-muted-foreground">Includes 2 hours of development time for updates and changes.</div>
                </li>
                <li>
                  <div className="font-semibold mb-1">Priority Care</div>
                  <div className="text-sm text-muted-foreground">Priority SLA, 5 hours development time, and strategy calls.</div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
