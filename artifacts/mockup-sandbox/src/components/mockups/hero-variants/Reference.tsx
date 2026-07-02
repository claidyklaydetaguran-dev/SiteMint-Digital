import { Sparkles, Users2, Globe, BarChart3, ArrowRight } from "lucide-react";

const NAV = ["Home", "Services", "Pricing", "Portfolio", "About"];

const FLOAT_CARDS = [
  {
    icon: Sparkles,
    title: "AI Automation",
    desc: "Workflows that save time and increase revenue",
    top: "0%",
    right: "32%",
  },
  {
    icon: Users2,
    title: "CRM Systems",
    desc: "Manage leads, clients & communications",
    top: "15%",
    right: "2%",
  },
  {
    icon: Globe,
    title: "Custom Websites",
    desc: "Beautiful, fast & optimized for conversions",
    top: "31%",
    right: "34%",
  },
  {
    icon: BarChart3,
    title: "Analytics & Growth",
    desc: "Track performance and scale with confidence",
    top: "44%",
    right: "10%",
  },
];

function LaptopScreen() {
  return (
    <div className="w-full h-full bg-[#182b47] rounded-t-[6px] p-3.5 flex flex-col gap-2.5 overflow-hidden">
      <div>
        <div className="text-white font-semibold text-[13px] leading-tight">Elevate Your Business</div>
        <div className="text-white font-semibold text-[13px] leading-tight">With Smart Digital Solutions</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[Sparkles, Users2, Globe, BarChart3].map((Icon, i) => (
          <div key={i} className="bg-white/10 rounded-md h-7 flex items-center justify-center">
            <Icon className="w-3 h-3 text-[#27d7ff]" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 mt-auto">
        {[
          { l: "Appointments", v: "1,248" },
          { l: "New Customers", v: "92" },
          { l: "Website Visitors", v: "64" },
          { l: "Revenue", v: "$28,540" },
        ].map((s) => (
          <div key={s.l} className="bg-white rounded-md px-1.5 py-1.5">
            <div className="text-[6px] text-gray-400 leading-tight">{s.l}</div>
            <div className="text-[10px] font-bold text-[#182b47] leading-tight">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabletScreen() {
  return (
    <div className="w-full h-full bg-[#0f2038] rounded-[10px] p-2.5 flex flex-col gap-2">
      <div className="text-white text-[10px] font-semibold">Workflow Overview</div>
      {[
        { l: "New Lead", v: "Sarah M." },
        { l: "Follow-up", v: "Due today" },
        { l: "Appointment", v: "2:30 PM" },
      ].map((r) => (
        <div key={r.l} className="bg-white/10 rounded-md px-2 py-1.5 flex items-center justify-between">
          <span className="text-white/70 text-[7px]">{r.l}</span>
          <span className="text-[#27d7ff] text-[7px] font-semibold">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function PhoneScreen() {
  return (
    <div className="w-full h-full bg-[#0f2038] rounded-[22px] p-2.5 flex flex-col gap-2">
      <div className="text-white text-[9px] font-semibold leading-tight">Automate.</div>
      <div className="text-white text-[9px] font-semibold leading-tight -mt-1.5">Engage. Grow.</div>
      <div className="grid grid-cols-2 gap-1.5 mt-1">
        {[
          { l: "Leads", v: "1,148" },
          { l: "Appts", v: "92" },
        ].map((s) => (
          <div key={s.l} className="bg-white rounded-md px-1.5 py-1">
            <div className="text-[5px] text-gray-400">{s.l}</div>
            <div className="text-[8px] font-bold text-[#0f2038]">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="bg-[#27d7ff] rounded-md text-center text-[6px] font-semibold text-[#0f2038] py-1 mt-auto">
        Automate Tasks
      </div>
    </div>
  );
}

export function Reference() {
  return (
    <div className="w-full min-h-screen bg-white font-['Plus_Jakarta_Sans'] relative overflow-hidden">
      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-10 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#23395d] to-[#27d7ff] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-[#23395d] tracking-tight">
            SiteMint <span className="font-normal text-gray-500">Digital</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          {NAV.map((n) => (
            <span key={n} className="hover:text-[#23395d] cursor-pointer transition-colors">
              {n}
            </span>
          ))}
        </div>
        <button className="bg-[#23395d] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1a2c47] transition-colors">
          Start Your Project
        </button>
      </nav>

      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[60%] h-[110%] bg-gradient-to-bl from-[#eef6ff] via-[#eef6ff]/60 to-transparent" />
        <div className="absolute -top-32 -left-20 w-[520px] h-[520px] rounded-full bg-[#eef6ff] blur-3xl opacity-70" />
        <div className="absolute top-40 right-10 w-[420px] h-[420px] rounded-full bg-[#27d7ff]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[500px] rounded-full bg-[#23395d]/5 blur-3xl" />
        {/* fine grid */}
        <svg className="absolute top-0 right-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#23395d" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* ribbon */}
        <svg className="absolute top-10 left-1/3 w-[700px] h-[300px] opacity-30" viewBox="0 0 700 300" fill="none">
          <path d="M0 150 C 150 30, 350 260, 700 90" stroke="#27d7ff" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* Hero content */}
      <div className="relative z-10 px-10 pt-10 pb-24 grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-8 items-center">
        {/* Left 45% */}
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#eef6ff] border border-[#c9e5ff] text-[#23395d] text-xs font-semibold rounded-full mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[#27d7ff]" />
            Now accepting new clients
          </div>

          <h1 className="font-['Playfair_Display'] text-4xl md:text-5xl font-bold text-[#182b47] leading-[1.15] tracking-tight mb-6">
            AI-Powered Websites &amp; Business Systems That Help You Get More Customers
          </h1>

          <p className="text-base text-gray-500 leading-relaxed mb-9">
            We build growth-focused websites, CRM systems, automation workflows, client
            portals, and custom business applications for service businesses, nonprofits,
            real estate professionals, and growing organizations.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <button className="bg-[#23395d] text-white px-6 py-3.5 text-sm font-semibold rounded-lg hover:bg-[#1a2c47] transition-colors flex items-center gap-2 shadow-lg shadow-blue-100">
              Get My Free Business Growth Assessment <ArrowRight className="w-4 h-4" />
            </button>
            <button className="text-sm font-semibold text-[#23395d] hover:underline underline-offset-4">
              View Our Work
            </button>
          </div>
        </div>

        {/* Right 55% - device mockup + floating cards */}
        <div className="relative h-[560px] hidden lg:block">
          {/* Laptop - 40% larger, shifted left so cards + phone/tablet sit clear on the right */}
          <div className="absolute left-0 bottom-0 w-[430px] z-0">
            <div className="rounded-t-[10px] bg-[#0b1a2e] p-2.5 shadow-2xl">
              <div className="aspect-[16/10]">
                <LaptopScreen />
              </div>
            </div>
            <div className="h-3.5 bg-gradient-to-b from-[#1f2f45] to-[#0b1a2e] rounded-b-[6px] mx-[-14px]" />
            <div className="h-1.5 bg-[#0b1a2e]/80 rounded-b-full mx-10" />
          </div>

          {/* Tablet - back-right, raised slightly */}
          <div className="absolute right-2 bottom-10 w-[136px] z-10">
            <div className="rounded-[16px] bg-[#0b1a2e] p-2 shadow-2xl border border-black/20">
              <div className="aspect-[3/4]">
                <TabletScreen />
              </div>
            </div>
          </div>

          {/* Phone - front, overlapping laptop's bottom-right corner slightly */}
          <div className="absolute right-[130px] bottom-0 w-[102px] z-20">
            <div className="rounded-[24px] bg-[#0b1a2e] p-1.5 shadow-2xl border border-black/20">
              <div className="aspect-[9/19]">
                <PhoneScreen />
              </div>
            </div>
          </div>

          {/* floating glass cards -- always on top, cascading down the right edge, clear of device screens */}
          {FLOAT_CARDS.map((c) => (
            <div
              key={c.title}
              className="absolute w-[178px] rounded-2xl px-3.5 py-3 flex items-start gap-2.5 shadow-xl border border-white/60 z-30"
              style={{
                top: c.top,
                right: c.right,
                background: "rgba(255,255,255,0.72)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div className="w-8 h-8 rounded-lg bg-[#eef6ff] flex items-center justify-center flex-shrink-0">
                <c.icon className="w-4 h-4 text-[#23395d]" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#182b47] leading-tight">{c.title}</div>
                <div className="text-[10px] text-gray-500 leading-snug mt-0.5">{c.desc}</div>
              </div>
            </div>
          ))}

          {/* soft glow under devices */}
          <div className="absolute left-10 bottom-0 w-[380px] h-10 bg-[#23395d]/10 rounded-full blur-2xl -z-10" />
        </div>
      </div>
    </div>
  );
}
