"use client";

const TECH_LOGOS = [
  {
    name: "Claude",
    svg: (
      <svg viewBox="0 0 100 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <circle cx="10" cy="10" r="6" fill="currentColor" fillOpacity="0.15"/>
        <circle cx="10" cy="10" r="3" fill="currentColor" fillOpacity="0.4"/>
        <text x="22" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Claude</text>
      </svg>
    ),
  },
  {
    name: "ElevenLabs",
    svg: (
      <svg viewBox="0 0 110 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <rect x="2" y="3" width="3" height="14" rx="1.5" fill="currentColor" fillOpacity="0.4"/>
        <rect x="8" y="6" width="3" height="8" rx="1.5" fill="currentColor" fillOpacity="0.3"/>
        <text x="16" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">ElevenLabs</text>
      </svg>
    ),
  },
  {
    name: "Plaid",
    svg: (
      <svg viewBox="0 0 60 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <rect x="1" y="3" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.35"/>
        <rect x="7" y="3" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.2"/>
        <rect x="1" y="10" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.2"/>
        <rect x="7" y="10" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.35"/>
        <text x="17" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Plaid</text>
      </svg>
    ),
  },
  {
    name: "Stripe",
    svg: (
      <svg viewBox="0 0 70 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <path d="M5 14C5 14 7 6 12 6C14 6 14 8 12 12C10 16 14 16 14 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4"/>
        <text x="20" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Stripe</text>
      </svg>
    ),
  },
  {
    name: "Turso",
    svg: (
      <svg viewBox="0 0 90 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <path d="M8 2L10 8L8 18L6 8Z" fill="currentColor" fillOpacity="0.3"/>
        <line x1="8" y1="2" x2="8" y2="18" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
        <text x="16" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Turso</text>
      </svg>
    ),
  },
  {
    name: "Vercel",
    svg: (
      <svg viewBox="0 0 70 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <path d="M3 16L10 4L17 16Z" fill="currentColor" fillOpacity="0.35"/>
        <text x="22" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Vercel</text>
      </svg>
    ),
  },
  {
    name: "TypeSafe Jev",
    svg: (
      <svg viewBox="0 0 80 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <rect x="3" y="6" width="12" height="3" rx="1" fill="currentColor" fillOpacity="0.3" transform="rotate(-20 9 7.5)"/>
        <rect x="3" y="11" width="12" height="3" rx="1" fill="currentColor" fillOpacity="0.25" transform="rotate(-20 9 12.5)"/>
        <text x="18" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">TypeSafe Jev</text>
      </svg>
    ),
  },
  {
    name: "Next.js",
    svg: (
      <svg viewBox="0 0 70 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" fill="none"/>
        <path d="M7 14V6L15 16" stroke="currentColor" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
        <line x1="13" y1="6" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
        <text x="22" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Next.js</text>
      </svg>
    ),
  },
  {
    name: "NVIDIA Jetson",
    svg: (
      <svg viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <rect x="2" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4" fill="none"/>
        <rect x="6" y="8" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.4"/>
        <text x="22" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">NVIDIA Jetson</text>
      </svg>
    ),
  },
  {
    name: "Seldon Wren",
    svg: (
      <svg viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
        <circle cx="9" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.4" fill="none"/>
        <path d="M6 10L8.5 12.5L12.5 7.5" stroke="currentColor" strokeWidth="1.5" opacity="0.6" strokeLinecap="round"/>
        <text x="20" y="15" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="system-ui">Tested by Wren</text>
      </svg>
    ),
  },
];

const LogoMarquee = () => {
  return (
    <section className="py-8 overflow-hidden bg-background" aria-label="Built with">
      <div className="relative">
        {/* Gradient fades on edges */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <div className="flex animate-marquee whitespace-nowrap">
          {[...TECH_LOGOS, ...TECH_LOGOS, ...TECH_LOGOS].map((logo, i) => (
            <div
              key={i}
              className="flex-shrink-0 mx-8 flex items-center justify-center text-muted-foreground opacity-50 hover:opacity-100 transition-opacity duration-300"
            >
              {logo.svg}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LogoMarquee;
