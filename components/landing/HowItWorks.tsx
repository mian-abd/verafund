"use client";

import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";

const steps = [
  {
    num: "1",
    title: "Start in One Click",
    desc: "No signup. You get a private workspace with sandbox cards and realistic history, so you can try everything right away.",
    img: "/images/step1.png",
  },
  {
    num: "2",
    title: "Connect Your Bank",
    desc: "Link a bank through Plaid. Your accounts and transactions are imported, and each subscription gets its own guarded card.",
    img: "/images/step2.png",
  },
  {
    num: "3",
    title: "Let Vera Guard You",
    desc: "Price hikes wait for your approval, trials lock on time, fraud gets flagged with reasons, and Vera answers questions by text or voice.",
    img: "/images/step3.png",
  },
];

const HowItWorks = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="how-it-works" className="py-20 px-4 bg-background" ref={ref}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="section-badge mb-4 inline-flex">[ How It Works ]</span>
          <h2 className="section-heading mt-4">
            Get Started in
            <br />
            <span className="font-serif-display italic font-normal">Three</span>{" "}
            Simple Steps
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              onMouseEnter={() => setActiveStep(i)}
              className={`group rounded-3xl border overflow-hidden transition-all duration-300 cursor-pointer ${
                activeStep === i
                  ? "border-primary bg-light-accent"
                  : "border-border bg-card"
              }`}
            >
              {/* Step Number */}
              <div className="p-6 pb-4">
                <span
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                    activeStep === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.num}
                </span>
              </div>

              {/* Image */}
              <div className="px-6">
                <div className="rounded-2xl overflow-hidden">
                  <img
                    src={step.img}
                    alt=""
                    className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              </div>

              {/* Text */}
              <div className="p-6">
                <h4 className="text-base font-bold text-foreground mb-1">{step.title}</h4>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mt-16"
        >
          <img src="/images/divider.png" alt="" className="w-full h-auto opacity-60" />
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
