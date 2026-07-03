"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  return (
    <section className="py-20 md:py-24 px-6 md:px-12 max-w-7xl mx-auto text-center">
      <div className="relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[300px] rounded-full bg-[radial-gradient(ellipse,rgba(110,231,183,0.06)_0%,transparent_70%)]" />
        </div>
        <h2 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight leading-none mb-6">
          Ready to dive in?
        </h2>
        <p className="text-lg mb-10 max-w-md mx-auto text-white/60">
          No sign-ups. No limits. Connect your wallet and start.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dex/v2/swap" className="btn-primary px-10 py-4 rounded-xl text-base inline-flex items-center gap-2">
            Launch app <ArrowRight size={18} />
          </Link>
          <Link href="/dex/v2/analytics" className="px-8 py-4 rounded-xl text-sm border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all">
            View analytics
          </Link>
        </div>
      </div>
    </section>
  );
}
