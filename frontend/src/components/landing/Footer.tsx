"use client";

import Link from "next/link";
import { Repeat } from "lucide-react";

export default function Footer() {
  return (
    <footer className="px-6 md:px-12 py-10 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-[#6EE7B7]">
          <Repeat size={12} className="text-[#0A0A0A] stroke-[2.5]" />
        </div>
        <span className="font-bold text-sm tracking-tight">dexsurl</span>
        </div>
        <p className="text-xs font-mono-dm text-white/70">
          Decentralized · Community Owned
        </p>
        <div className="flex gap-6 text-xs text-white/60">
          <Link href="/dex/v2/swap" className="hover:text-white transition-colors">Swap</Link>
          <Link href="/dex/v2/staking" className="hover:text-white transition-colors">Staking</Link>
          <Link href="/dex/v2/analytics" className="hover:text-white transition-colors">Analytics</Link>
          <Link href="/governance" className="hover:text-white transition-colors">Governance</Link>
        </div>
      </div>
    </footer>
  );
}
