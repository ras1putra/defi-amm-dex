"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useOverview } from "@/hooks/useAnalytics";
import { formatUSD } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/[0.08]">
      <p className="text-xs text-white/40 mb-0.5">{label}</p>
      <p className="text-2xl font-black stat-number">{value}</p>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="p-5 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/[0.08]">
      <div className="h-3 w-20 rounded bg-white/10 mb-2" />
      <div className="h-7 w-24 rounded bg-white/10 animate-pulse" />
    </div>
  );
}

export default function Hero() {
  const { data: overview, isLoading } = useOverview();

  const totalFees = overview?.pairs?.reduce((sum, p) => sum + (p.fees_24h_usd || 0), 0) ?? 0;

  return (
    <section className="pt-24 md:pt-36 pb-16 md:pb-20 px-6 md:px-12 max-w-7xl mx-auto">
      <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full pointer-events-none bg-[radial-gradient(circle,rgba(110,231,183,0.06)_0%,transparent_70%)]" />

      <div className="max-w-3xl">
        <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none mb-6">
          TRADE SMARTER.<br />
          <span className="stat-number">EARN MORE.</span>
        </h1>

        <p className="text-lg md:text-xl mb-10 max-w-lg leading-relaxed text-white/70">
          Swap any token, earn from every trade, stake for yield, and vote on what comes next.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Link href="/dex/v2/swap" className="btn-primary px-8 py-4 rounded-xl text-base inline-flex items-center gap-2">
            Start trading <ArrowRight size={18} />
          </Link>
          <Link href="/dex/v2/liquidity" className="px-8 py-4 rounded-xl text-base font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all">
            Add liquidity
          </Link>
        </div>
      </div>

      <div className="mt-16 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total Value Locked" value={formatUSD(overview?.total_tvl ?? 0)} />
            <StatCard label="24h Volume" value={formatUSD(overview?.total_volume_24h ?? 0)} />
            <StatCard label="24h Fees" value={formatUSD(totalFees)} />
            <StatCard label="Active Pools" value={String(overview?.pair_count ?? 0)} />
          </>
        )}
      </div>
    </section>
  );
}
