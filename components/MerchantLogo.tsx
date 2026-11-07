"use client";

import { useState } from "react";
import { getBrandColor, getInitials, inferDomain } from "@/lib/brand";

export function MerchantLogo({
  domain = null,
  name,
  size = 32,
}: {
  domain?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const resolvedDomain = domain || inferDomain(name);

  if (!resolvedDomain || failed) {
    const bg = getBrandColor(name);
    const initials = getInitials(name);
    const fontSize = Math.max(10, size * 0.38);
    return (
      <div
        aria-hidden="true"
        className="rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold select-none"
        style={{ width: size, height: size, backgroundColor: bg, fontSize }}
      >
        {initials}
      </div>
    );
  }

  const logoUrl = `https://www.google.com/s2/favicons?domain=${resolvedDomain}&sz=${Math.min(size * 2, 256)}`;

  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="rounded-lg object-contain flex-shrink-0 bg-white"
      onError={() => setFailed(true)}
    />
  );
}
