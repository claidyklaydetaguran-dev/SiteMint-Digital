export function GoldAccent() {
  return (
    <div className="w-full min-h-screen bg-[#FAF7F2] font-['Plus_Jakarta_Sans']">
      {/* Nav */}
      <nav className="flex items-center justify-between px-10 py-5 bg-[#FAF7F2]/90 backdrop-blur-sm border-b border-[#E8E0D4] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#B8860B] flex items-center justify-center text-white font-bold text-sm font-['Playfair_Display']">S</div>
          <span className="font-['Playfair_Display'] font-semibold text-lg text-[#1A1A1A] tracking-tight">SiteMint Digital</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[#5A5A5A]">
          <span className="hover:text-[#B8860B] cursor-pointer transition-colors">Services</span>
          <span className="hover:text-[#B8860B] cursor-pointer transition-colors">Pricing</span>
          <span className="hover:text-[#B8860B] cursor-pointer transition-colors">Portfolio</span>
          <span className="hover:text-[#B8860B] cursor-pointer transition-colors">About</span>
        </div>
        <button className="bg-[#B8860B] text-white text-sm font-semibold px-5 py-2.5 hover:bg-[#9A7009] transition-colors">
          Book a Call
        </button>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/__mockup/images/hero-bg.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF7F2]/55 via-[#FAF7F2]/20 to-[#FAF7F2]" />

        <div className="relative z-10 px-10 pt-20 pb-32 max-w-5xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#B8860B]/10 border border-[#B8860B]/20 text-[#8B6508] text-xs font-semibold uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
            Now accepting new clients
          </div>

          <h1 className="font-['Playfair_Display'] text-6xl font-bold text-[#1A1A1A] leading-[1.08] tracking-tight mb-7 max-w-3xl">
            Websites and Web Apps Built to Help Your Business Grow.
          </h1>

          <p className="text-lg text-[#5A5A5A] leading-relaxed max-w-xl mb-10">
            Clean, professional websites and custom web applications that help businesses look credible and operate smarter.
          </p>

          <div className="flex items-center gap-4">
            <button className="bg-[#B8860B] text-white px-7 py-4 text-sm font-semibold hover:bg-[#9A7009] transition-colors flex items-center gap-2">
              Book a Free Consultation →
            </button>
            <button className="border border-[#C8B89A] text-[#5A5A5A] px-7 py-4 text-sm font-medium hover:bg-[#F0EAE0] transition-colors">
              View Services
            </button>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section
        className="border-y border-[#E8E0D4] py-5 relative"
        style={{ backgroundImage: "url('/__mockup/images/warm-accent-bg.png')", backgroundSize: "cover" }}
      >
        <div className="px-10 flex flex-wrap justify-between items-center gap-4 text-xs font-semibold text-[#7A6A50] uppercase tracking-widest">
          {["Fast Turnaround", "Mobile-Friendly", "SEO-Ready", "Business Automation", "Ongoing Support"].map(t => (
            <span key={t} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-[#B8860B]" />{t}
            </span>
          ))}
        </div>
      </section>

      {/* Services preview */}
      <section className="px-10 py-20">
        <h2 className="font-['Playfair_Display'] text-4xl font-bold text-[#1A1A1A] mb-3">What We Build</h2>
        <p className="text-[#7A7A7A] mb-12 text-sm">Six focused services, each scoped and priced separately.</p>
        <div className="grid grid-cols-3 gap-5">
          {[
            { n: "Website Design & Dev", d: "Mobile-responsive, high-converting sites." },
            { n: "Web Application Dev", d: "Custom portals, CRMs, and internal tools." },
            { n: "SEO Foundation", d: "Get found by the right people on Google." },
            { n: "Blog & Content", d: "Strategic content that drives organic traffic." },
            { n: "Ongoing Care", d: "Security, performance, and peace of mind." },
            { n: "Automation", d: "Connect your tools. Eliminate manual work." },
          ].map(s => (
            <div key={s.n} className="bg-[#F5EFE6] border border-[#E8E0D4] p-6 hover:border-[#B8860B]/40 transition-colors cursor-pointer group">
              <div className="w-8 h-1 bg-[#B8860B] mb-4" />
              <h3 className="font-semibold text-[#1A1A1A] text-sm mb-2">{s.n}</h3>
              <p className="text-[#7A7A7A] text-xs leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
