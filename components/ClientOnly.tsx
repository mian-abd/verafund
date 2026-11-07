"use client";

import { useEffect, useState } from "react";

// Renders children only after hydration. Charts measure the DOM and format dates in
// the browser's time zone, so server-rendering them causes hydration mismatches.
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}
