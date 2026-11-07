"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { BrainCircuit, Cpu, CreditCard, Database, Landmark, Mic, ShieldCheck, Workflow } from "lucide-react";

const STACK = [
  { icon: CreditCard, name: "Stripe Issuing", role: "Virtual cards with per-charge spending limits" },
  { icon: Landmark, name: "Plaid", role: "Bank connections and transaction import" },
  { icon: BrainCircuit, name: "Claude", role: "Vera’s answers and receipt and photo reading" },
  { icon: Workflow, name: "TypeSafe Jev", role: "Typed decisions in milliseconds: fraud triage, subscription checks, what you asked Vera to do" },
  { icon: Mic, name: "ElevenLabs", role: "Vera’s voice for alerts and calls" },
  { icon: Database, name: "Turso / SQLite", role: "The same database in the cloud or on-device" },
  { icon: Cpu, name: "NVIDIA Jetson", role: "Self-hosted, with Vera’s actions on a local model on the GPU" },
  { icon: ShieldCheck, name: "Seldon Wren", role: "AI QA agent testing the core flows" },
];

const IntegrationSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="integration" className="py-20 px-4 bg-background" ref={ref}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="section-badge mb-4 inline-flex">[ Technology Stack ]</span>
          <h2 className="section-heading mt-4">
            Rules Decide.{" "}
            <span className="font-serif-display italic font-normal">AI Explains.</span>
            <br />
            You Approve.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
            Card rules and the fraud engine are deterministic and tested. AI ranks and explains, and it never moves money
            on its own.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STACK.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06 }}
              className="rounded-3xl border border-border bg-warm p-6"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <item.icon size={20} aria-hidden="true" />
              </span>
              <h3 className="font-bold text-foreground">{item.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.role}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default IntegrationSection;
