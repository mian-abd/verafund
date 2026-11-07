"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const AnimatedBlock = ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const FraudDetectionSvg = () => (
  <svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[280px] h-auto">
    <path d="M200 30L310 80V170C310 230 260 275 200 290C140 275 90 230 90 170V80L200 30Z" fill="#E8734A" fillOpacity="0.12" stroke="#E8734A" strokeWidth="2.5"/>
    <path d="M200 50L290 90V165C290 218 248 258 200 270C152 258 110 218 110 165V90L200 50Z" fill="#FFF5EE" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.4"/>
    <path d="M165 155L190 180L240 130" stroke="#E8734A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <g transform="translate(280, 45)">
      <circle cx="0" cy="0" r="22" fill="#E8734A" fillOpacity="0.15"/>
      <path d="M0-12C-6-12-10-8-10-2V2L-14 6V8H14V6L10 2V-2C10-8 6-12 0-12Z" fill="#E8734A" fillOpacity="0.8"/>
      <circle cx="0" cy="12" r="3" fill="#E8734A" fillOpacity="0.8"/>
      <circle cx="10" cy="-10" r="5" fill="#E85D2A"/>
      <text x="10" y="-7" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">!</text>
    </g>
    <g transform="translate(50, 100)">
      <rect x="0" y="0" width="45" height="80" rx="8" fill="white" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.3"/>
      <rect x="8" y="12" width="29" height="4" rx="2" fill="#E8734A" fillOpacity="0.15"/>
      <rect x="8" y="20" width="20" height="4" rx="2" fill="#E8734A" fillOpacity="0.1"/>
      <rect x="8" y="30" width="29" height="20" rx="3" fill="#E8734A" fillOpacity="0.08"/>
      <circle cx="22.5" cy="68" r="4" fill="#E8734A" fillOpacity="0.12"/>
    </g>
    <line x1="130" y1="100" x2="160" y2="100" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.2" strokeDasharray="4 3"/>
    <line x1="240" y1="100" x2="270" y2="100" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.2" strokeDasharray="4 3"/>
    <line x1="130" y1="200" x2="160" y2="200" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.2" strokeDasharray="4 3"/>
    <line x1="240" y1="200" x2="270" y2="200" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.2" strokeDasharray="4 3"/>
    <circle cx="330" cy="140" r="3" fill="#E8734A" fillOpacity="0.15"/>
    <circle cx="345" cy="130" r="2" fill="#E8734A" fillOpacity="0.1"/>
    <circle cx="340" cy="155" r="2.5" fill="#E8734A" fillOpacity="0.12"/>
    <circle cx="60" cy="50" r="3" fill="#E8734A" fillOpacity="0.12"/>
    <circle cx="75" cy="65" r="2" fill="#E8734A" fillOpacity="0.08"/>
  </svg>
);

const DashboardSvg = () => (
  <svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[320px] h-auto">
    <rect x="40" y="30" width="320" height="240" rx="16" fill="white" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.25"/>
    <rect x="40" y="30" width="320" height="36" rx="16" fill="#E8734A" fillOpacity="0.06"/>
    <circle cx="62" cy="48" r="5" fill="#E8734A" fillOpacity="0.3"/>
    <circle cx="78" cy="48" r="5" fill="#E8734A" fillOpacity="0.15"/>
    <circle cx="94" cy="48" r="5" fill="#E8734A" fillOpacity="0.1"/>
    <rect x="280" y="42" width="60" height="12" rx="6" fill="#E8734A" fillOpacity="0.1"/>
    <rect x="60" y="80" width="88" height="50" rx="10" fill="#E8734A" fillOpacity="0.08"/>
    <rect x="70" y="90" width="40" height="6" rx="3" fill="#E8734A" fillOpacity="0.2"/>
    <rect x="70" y="102" width="55" height="10" rx="3" fill="#E8734A" fillOpacity="0.35"/>
    <rect x="70" y="118" width="30" height="4" rx="2" fill="#4CAF50" fillOpacity="0.4"/>
    <rect x="156" y="80" width="88" height="50" rx="10" fill="#E8734A" fillOpacity="0.08"/>
    <rect x="166" y="90" width="40" height="6" rx="3" fill="#E8734A" fillOpacity="0.2"/>
    <rect x="166" y="102" width="55" height="10" rx="3" fill="#E8734A" fillOpacity="0.35"/>
    <rect x="166" y="118" width="25" height="4" rx="2" fill="#E8734A" fillOpacity="0.3"/>
    <rect x="252" y="80" width="88" height="50" rx="10" fill="#E8734A" fillOpacity="0.08"/>
    <rect x="262" y="90" width="40" height="6" rx="3" fill="#E8734A" fillOpacity="0.2"/>
    <rect x="262" y="102" width="55" height="10" rx="3" fill="#E8734A" fillOpacity="0.35"/>
    <rect x="262" y="118" width="35" height="4" rx="2" fill="#4CAF50" fillOpacity="0.4"/>
    <rect x="60" y="145" width="185" height="110" rx="10" fill="#E8734A" fillOpacity="0.04"/>
    <polyline points="75,230 100,215 125,225 150,195 175,200 200,170 225,185" stroke="#E8734A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M75,230 100,215 125,225 150,195 175,200 200,170 225,185 225,240 75,240Z" fill="#E8734A" fillOpacity="0.06"/>
    <circle cx="150" cy="195" r="4" fill="#E8734A" fillOpacity="0.6"/>
    <circle cx="200" cy="170" r="4" fill="#E8734A"/>
    <rect x="255" y="145" width="85" height="110" rx="10" fill="#E8734A" fillOpacity="0.04"/>
    <rect x="265" y="158" width="65" height="8" rx="4" fill="#E8734A" fillOpacity="0.15"/>
    <rect x="265" y="174" width="50" height="8" rx="4" fill="#E8734A" fillOpacity="0.1"/>
    <rect x="265" y="190" width="60" height="8" rx="4" fill="#E8734A" fillOpacity="0.12"/>
    <rect x="265" y="206" width="40" height="8" rx="4" fill="#E8734A" fillOpacity="0.08"/>
    <rect x="265" y="222" width="55" height="8" rx="4" fill="#E8734A" fillOpacity="0.1"/>
    <circle cx="340" cy="48" r="3" fill="#4CAF50"/>
  </svg>
);

const PurchaseAdvisorSvg = () => (
  <svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[280px] h-auto">
    <path d="M120 100H280L265 260H135L120 100Z" fill="#E8734A" fillOpacity="0.08" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.3"/>
    <path d="M160 100V80C160 58 178 40 200 40C222 40 240 58 240 80V100" stroke="#E8734A" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <g transform="translate(260, 60)">
      <circle cx="0" cy="0" r="35" fill="white" fillOpacity="0.9" stroke="#E8734A" strokeWidth="2.5"/>
      <line x1="24" y1="24" x2="48" y2="48" stroke="#E8734A" strokeWidth="3" strokeLinecap="round"/>
      <path d="M-12 2L-4 10L14-8" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
    <g transform="translate(70, 160)">
      <rect x="30" y="0" width="140" height="24" rx="6" fill="white" stroke="#E8734A" strokeWidth="1" strokeOpacity="0.2"/>
      <rect x="32" y="2" width="90" height="20" rx="5" fill="#E8734A" fillOpacity="0.15"/>
      <text x="50" y="16" fontSize="9" fill="#E8734A" fontWeight="600" fontFamily="system-ui">Budget Impact</text>
    </g>
    <g transform="translate(70, 195)">
      <rect x="30" y="0" width="140" height="24" rx="6" fill="white" stroke="#E8734A" strokeWidth="1" strokeOpacity="0.2"/>
      <rect x="32" y="2" width="60" height="20" rx="5" fill="#4CAF50" fillOpacity="0.2"/>
      <text x="50" y="16" fontSize="9" fill="#4CAF50" fontWeight="600" fontFamily="system-ui">Goal Status</text>
    </g>
    <g transform="translate(200, 220)">
      <rect x="0" y="0" width="100" height="32" rx="16" fill="#E8734A" fillOpacity="0.12" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.3"/>
      <text x="50" y="21" textAnchor="middle" fontSize="11" fill="#E8734A" fontWeight="700" fontFamily="system-ui">Worth it?</text>
    </g>
    <g transform="translate(310, 140)">
      <rect x="0" y="0" width="55" height="30" rx="6" fill="white" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.25"/>
      <text x="27.5" y="20" textAnchor="middle" fontSize="13" fill="#E8734A" fontWeight="700" fontFamily="system-ui">$49</text>
    </g>
    <circle cx="80" cy="60" r="4" fill="#E8734A" fillOpacity="0.1"/>
    <circle cx="340" cy="230" r="3" fill="#E8734A" fillOpacity="0.12"/>
    <circle cx="60" cy="240" r="5" fill="#E8734A" fillOpacity="0.08"/>
  </svg>
);

const VoiceAssistantSvg = () => (
  <svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[280px] h-auto">
    <g transform="translate(200, 120)">
      <rect x="-18" y="-50" width="36" height="65" rx="18" fill="#E8734A" fillOpacity="0.15" stroke="#E8734A" strokeWidth="2"/>
      <line x1="-10" y1="-35" x2="10" y2="-35" stroke="#E8734A" strokeWidth="1" strokeOpacity="0.3"/>
      <line x1="-10" y1="-25" x2="10" y2="-25" stroke="#E8734A" strokeWidth="1" strokeOpacity="0.3"/>
      <line x1="-10" y1="-15" x2="10" y2="-15" stroke="#E8734A" strokeWidth="1" strokeOpacity="0.3"/>
      <path d="M-30 20C-30-10-18-30-18-30" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.4" fill="none"/>
      <path d="M30 20C30-10 18-30 18-30" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.4" fill="none"/>
      <line x1="0" y1="20" x2="0" y2="45" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.4"/>
      <line x1="-15" y1="45" x2="15" y2="45" stroke="#E8734A" strokeWidth="2.5" strokeOpacity="0.4" strokeLinecap="round"/>
    </g>
    <path d="M130 90C120 105 120 135 130 150" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.3" strokeLinecap="round" fill="none"/>
    <path d="M115 78C100 100 100 140 115 162" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.2" strokeLinecap="round" fill="none"/>
    <path d="M100 68C80 95 80 145 100 172" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.1" strokeLinecap="round" fill="none"/>
    <path d="M270 90C280 105 280 135 270 150" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.3" strokeLinecap="round" fill="none"/>
    <path d="M285 78C300 100 300 140 285 162" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.2" strokeLinecap="round" fill="none"/>
    <path d="M300 68C320 95 320 145 300 172" stroke="#E8734A" strokeWidth="2" strokeOpacity="0.1" strokeLinecap="round" fill="none"/>
    <g transform="translate(65, 60)">
      <rect x="0" y="0" width="55" height="40" rx="10" fill="white" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.25"/>
      <path d="M20 40L15 52L30 40" fill="white" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.25"/>
      <rect x="10" y="12" width="35" height="5" rx="2.5" fill="#E8734A" fillOpacity="0.2"/>
      <rect x="10" y="22" width="25" height="5" rx="2.5" fill="#E8734A" fillOpacity="0.12"/>
    </g>
    <g transform="translate(280, 40)">
      <rect x="0" y="0" width="75" height="55" rx="10" fill="#E8734A" fillOpacity="0.1" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.3"/>
      <path d="M55 55L60 68L45 55" fill="#E8734A" fillOpacity="0.1" stroke="#E8734A" strokeWidth="1.5" strokeOpacity="0.3"/>
      <rect x="10" y="12" width="55" height="5" rx="2.5" fill="#E8734A" fillOpacity="0.25"/>
      <rect x="10" y="22" width="40" height="5" rx="2.5" fill="#E8734A" fillOpacity="0.15"/>
      <rect x="10" y="32" width="50" height="5" rx="2.5" fill="#E8734A" fillOpacity="0.2"/>
    </g>
    <g transform="translate(100, 215)">
      {[0,10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190].map((x, i) => {
        const heights = [20,34,50,30,40,26,44,34,20,40,30,50,34,26,44,30,40,26,34,20];
        const opacities = [0.15,0.2,0.3,0.25,0.35,0.2,0.4,0.25,0.15,0.3,0.2,0.35,0.2,0.25,0.3,0.2,0.15,0.2,0.25,0.15];
        const h = heights[i]; const y = (50 - h) / 2;
        return <rect key={x} x={x} y={y} width="4" height={h} rx="2" fill="#E8734A" fillOpacity={opacities[i]}/>;
      })}
    </g>
    <g transform="translate(305, 100)">
      <rect x="0" y="0" width="50" height="22" rx="11" fill="#E8734A" fillOpacity="0.12"/>
      <text x="25" y="15" textAnchor="middle" fontSize="10" fill="#E8734A" fontWeight="600" fontFamily="system-ui">Vera</text>
    </g>
  </svg>
);

const FeaturesSection = () => {
  return (
    <section id="features" className="py-20 px-4 bg-background">
      <div className="max-w-6xl mx-auto">
        <AnimatedBlock className="text-center mb-16">
          <span className="section-badge mb-4 inline-flex">[ What VeraFund Does ]</span>
          <h2 className="section-heading mt-4">
            Everything You Need
            <br />
            to Stay in{" "}
            <span className="font-serif-display italic font-normal">Control</span>
          </h2>
        </AnimatedBlock>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <AnimatedBlock delay={0.1} className="relative rounded-3xl bg-warm border border-border overflow-hidden p-8 flex flex-col">
            <div className="relative z-10 mb-4">
              <h3 className="text-xl font-bold text-foreground mb-2">Subscription Guard</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Every subscription gets its own virtual card with a hard price cap. A price hike is declined until you approve it, and a free trial locks before it can turn into a paid plan.
              </p>
            </div>
            <div className="flex-1 flex justify-center items-center">
              <FraudDetectionSvg />
            </div>
          </AnimatedBlock>

          <AnimatedBlock delay={0.2} className="relative rounded-3xl bg-warm border border-border overflow-hidden p-8 flex flex-col">
            <div className="relative z-10 mb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-2">Smart Financial Dashboard</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Connect your bank through Plaid and see income, spending, budgets, upcoming bills and a 30-day cash-flow forecast in one place.
                  </p>
                </div>
                <span className="text-primary font-bold text-sm uppercase tracking-wide ml-3">Live</span>
              </div>
            </div>
            <div className="flex-1 flex justify-center items-center">
              <DashboardSvg />
            </div>
          </AnimatedBlock>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatedBlock delay={0.3} className="relative rounded-3xl bg-warm border border-border overflow-hidden p-8 flex flex-col">
            <div className="relative z-10 mb-4">
              <h3 className="text-xl font-bold text-foreground mb-2">Purchase Analyzer</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Snap a photo or type a price. VeraFund shows the hours of work it costs, what it does to your budget, and how many weeks it pushes back each goal.
              </p>
            </div>
            <div className="flex-1 flex justify-center items-center">
              <PurchaseAdvisorSvg />
            </div>
          </AnimatedBlock>

          <AnimatedBlock delay={0.4} className="relative rounded-3xl bg-warm border border-border overflow-hidden p-8 flex flex-col">
            <div className="relative z-10 mb-4">
              <h3 className="text-xl font-bold text-foreground mb-2">Vera, by text or voice</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask Vera on any page, or call her hands-free. She flags suspicious charges with a plain-English reason, asks “was this you?”, and answers from your real numbers.
              </p>
            </div>
            <div className="flex-1 flex justify-center items-center">
              <VoiceAssistantSvg />
            </div>
          </AnimatedBlock>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
