export function PureMinimal() {
  return (
    <div className="w-full min-h-screen bg-[#F8F8F6] font-['Plus_Jakarta_Sans']">
      {/* Nav */}
      <nav className="flex items-center justify-between px-12 py-6 bg-[#F8F8F6]/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#111111]" />
          <span className="font-light text-base text-[#111111] tracking-widest uppercase text-xs">SiteMint Digital</span>
        </div>
        <div className="hidden md:flex items-center gap-10 text-xs font-medium text-[#888888] uppercase tracking-widest">
          <span className="hover:text-[#111111] cursor-pointer transition-colors">Services</span>
          <span className="hover:text-[#111111] cursor-pointer transition-colors">Pricing</span>
          <span className="hover:text-[#111111] cursor-pointer transition-colors">Portfolio</span>
          <span className="hover:text-[#111111] cursor-pointer transition-colors">About</span>
        </div>
        <button className="border border-[#111111] text-[#111111] text-xs font-semibold px-5 py-2.5 uppercase tracking-widest hover:bg-[#111111] hover:text-white transition-colors">
          Book a Call
        </button>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-12 pt-16 pb-28">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{ backgroundImage: "url('/__mockup/images/hero-bg.png')" }}
        />
        <div className="relative z-10 max-w-5xl">
          <p className="text-xs text-[#AAAAAA] uppercase tracking-[0.3em] mb-10">Now accepting new clients</p>

          <h1 className="font-['Playfair_Display'] text-7xl font-normal text-[#111111] leading-[1.04] tracking-tight mb-8 max-w-4xl">
            Websites and Web Apps Built to Help Your Business Grow.
          </h1>

          <div className="w-16 h-px bg-[#111111] mb-8" />

          <p className="text-base text-[#888888] leading-relaxed max-w-lg mb-12 font-light">
            Clean, professional websites and custom web applications that help businesses look credible and operate smarter.
          </p>

          <div className="flex items-center gap-6">
            <button className="bg-[#111111] text-white px-8 py-4 text-xs font-semibold uppercase tracking-widest hover:bg-[#333333] transition-colors">
              Book a Free Consultation
            </button>
            <button className="text-xs font-semibold uppercase tracking-widest text-[#111111] flex items-center gap-2 hover:gap-3 transition-all">
              View Services <span className="text-base">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-t border-[#E5E5E3] py-4 bg-white">
        <div className="px-12 flex flex-wrap justify-between items-center gap-4 text-[10px] font-semibold text-[#BBBBBB] uppercase tracking-[0.2em]">
          {["Fast Turnaround", "Mobile-Friendly", "SEO-Ready", "Business Automation", "Ongoing Support"].map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="px-12 py-20 bg-white">
        <div className="flex items-end justify-between mb-14">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#AAAAAA] mb-3">What We Build</p>
            <h2 className="font-['Playfair_Display'] text-4xl font-normal text-[#111111]">Six focused services.</h2>
          </div>
          <span className="text-xs uppercase tracking-widest text-[#111111] cursor-pointer border-b border-[#111111] pb-0.5">View all</span>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[#E5E5E3]">
          {[
            { n: "Website Design & Dev", d: "Mobile-responsive, high-converting sites." },
            { n: "Web Application Dev", d: "Custom portals, CRMs, and internal tools." },
            { n: "SEO Foundation", d: "Get found by the right people on Google." },
            { n: "Blog & Content", d: "Strategic content that drives organic traffic." },
            { n: "Ongoing Care", d: "Security, performance, and peace of mind." },
            { n: "Automation", d: "Connect your tools. Eliminate manual work." },
          ].map(s => (
            <div key={s.n} className="bg-white p-7 hover:bg-[#F8F8F6] transition-colors cursor-pointer group">
              <h3 className="font-medium text-[#111111] text-sm mb-2">{s.n}</h3>
              <p className="text-[#AAAAAA] text-xs leading-relaxed">{s.d}</p>
              <div className="mt-4 w-0 group-hover:w-6 h-px bg-[#111111] transition-all" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
