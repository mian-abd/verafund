"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const CTASection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="contact" className="py-20 px-4 bg-background" ref={ref}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="relative rounded-3xl overflow-hidden"
        >
          <img src="/images/cta-bg.png" alt="" className="w-full h-auto min-h-[320px] object-cover" />

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 max-w-xl">
              Stop Paying for Charges{" "}
              <span className="font-serif-display italic font-normal">You Never</span> Approved
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Sign up for a private workspace with sandbox cards. Try a price hike, a free trial and a fraud alert in
              under a minute.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8 text-sm">
              <span className="font-bold text-foreground">Blocks before it charges</span>
              <span className="font-bold text-foreground">Evidence for every decision</span>
              <span className="font-bold text-foreground">Runs on your own hardware</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Sign up free
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-dark px-8 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Log in
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
