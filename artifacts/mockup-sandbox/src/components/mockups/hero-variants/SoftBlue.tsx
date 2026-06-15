export function SoftBlue() {
  return (
    <div className="w-full min-h-screen bg-white font-['Plus_Jakarta_Sans']">
      {/* Nav */}
      <nav className="flex items-center justify-between px-10 py-5 bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2563EB] flex items-center justify-center text-white font-bold text-sm">S</div>
          <span className="font-semibold text-lg text-gray-900 tracking-tight">SiteMint Digital</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
          <span className="hover:text-[#2563EB] cursor-pointer transition-colors">Services</span>
          <span className="hover:text-[#2563EB] cursor-pointer transition-colors">Pricing</span>
          <span className="hover:text-[#2563EB] cursor-pointer transition-colors">Portfolio</span>
          <span className="hover:text-[#2563EB] cursor-pointer transition-colors">About</span>
        </div>
        <button className="bg-[#2563EB] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1D4ED8] transition-colors">
          Book a Call
        </button>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] via-white to-[#F0F9FF]">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-[url('/__mockup/images/hero-bg.png')] bg-cover bg-center opacity-20" />
        <div className="absolute top-20 right-20 w-80 h-80 bg-[#2563EB]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-40 w-60 h-60 bg-[#60A5FA]/10 rounded-full blur-2xl" />

        <div className="relative z-10 px-10 pt-20 pb-32 max-w-5xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-xs font-semibold rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
            Now accepting new clients
          </div>

          <h1 className="text-6xl font-bold text-gray-900 leading-[1.08] tracking-tight mb-7 max-w-3xl">
            Websites and Web Apps Built to Help Your Business Grow.
          </h1>

          <p className="text-lg text-gray-500 leading-relaxed max-w-xl mb-10">
            Clean, professional websites and custom web applications that help businesses look credible and operate smarter.
          </p>

          <div className="flex items-center gap-4">
            <button className="bg-[#2563EB] text-white px-7 py-4 text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors flex items-center gap-2 shadow-lg shadow-blue-200">
              Book a Free Consultation →
            </button>
            <button className="border border-gray-200 text-gray-600 px-7 py-4 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              View Services
            </button>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-gray-50 border-y border-gray-100 py-5">
        <div className="px-10 flex flex-wrap justify-between items-center gap-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {["Fast Turnaround", "Mobile-Friendly", "SEO-Ready", "Business Automation", "Ongoing Support"].map(t => (
            <span key={t} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-[#2563EB]" />{t}
            </span>
          ))}
        </div>
      </section>

      {/* Services preview */}
      <section className="px-10 py-20">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-2">What We Build</h2>
            <p className="text-gray-400 text-sm">Six focused services, each scoped and priced separately.</p>
          </div>
          <span className="text-[#2563EB] text-sm font-medium cursor-pointer">View all →</span>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {[
            { n: "Website Design & Dev", d: "Mobile-responsive, high-converting sites." },
            { n: "Web Application Dev", d: "Custom portals, CRMs, and internal tools." },
            { n: "SEO Foundation", d: "Get found by the right people on Google." },
            { n: "Blog & Content", d: "Strategic content that drives organic traffic." },
            { n: "Ongoing Care", d: "Security, performance, and peace of mind." },
            { n: "Automation", d: "Connect your tools. Eliminate manual work." },
          ].map((s, i) => (
            <div key={s.n} className="border border-gray-100 rounded-xl p-6 hover:border-[#2563EB]/30 hover:shadow-lg hover:shadow-blue-50 transition-all cursor-pointer group">
              <div className="w-10 h-10 bg-[#EFF6FF] rounded-lg flex items-center justify-center mb-4">
                <span className="text-[#2563EB] text-sm font-bold">0{i + 1}</span>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-2">{s.n}</h3>
              <p className="text-gray-400 text-xs leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
