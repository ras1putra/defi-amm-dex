"use client";

import { ArrowLeftRight } from "lucide-react";
import SwapPanel from "@/components/dex/SwapPanel";
import AppNavbar from "@/components/layout/AppNavbar";

export default function SwapPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-syne flex flex-col grain-overlay">
      <AppNavbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-10">
        <div className="w-full max-w-md mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-lg bg-[#6EE7B7]/10 flex items-center justify-center">
              <ArrowLeftRight size={16} className="text-[#6EE7B7]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Swap V2</h1>
          </div>
          <p className="mt-2 text-white/70 font-mono-dm text-sm">{"// Swap tokens at the best available rates"}</p>
        </div>
        <SwapPanel />
      </main>
    </div>
  );
}
