"use client";

import Link from "next/link";
import { Repeat } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 bg-[#0A0A0A]/85 backdrop-blur-xl border-b border-white/5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#6EE7B7]">
          <Repeat size={16} className="text-[#0A0A0A] stroke-[2.5]" />
        </div>
        <span className="text-lg font-bold tracking-tight">dexsurl</span>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/dex/v2/swap" className="btn-primary text-sm px-5 py-2 rounded-lg inline-block">
          Launch App →
        </Link>
      </div>
    </nav>
  );
}
