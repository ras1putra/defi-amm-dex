"use client";

import { Repeat, Droplets, Gem, Vote } from "lucide-react";

const PRODUCTS = [
  {
    icon: <Repeat size={22} />,
    title: "Swap",
    desc: "Instant token swaps with minimal slippage. Powered by our constant product AMM.",
    color: "#6EE7B7",
  },
  {
    icon: <Droplets size={22} />,
    title: "Liquidity",
    desc: "Provide liquidity and earn fees from every swap. Withdraw anytime.",
    color: "#22D3EE",
  },
  {
    icon: <Gem size={22} />,
    title: "Staking",
    desc: "Stake LP tokens to earn yield. Real-time APR tracking.",
    color: "#A78BFA",
  },
  {
    icon: <Vote size={22} />,
    title: "Governance",
    desc: "Propose changes and vote on protocol upgrades. Your voice matters.",
    color: "#F59E0B",
  },
];

export default function Products() {
  return (
    <section className="py-16 md:py-20 px-6 md:px-12 max-w-7xl mx-auto">
      <div className="mb-12">
        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
          Everything you need to grow.
        </h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {PRODUCTS.map(({ icon, title, desc, color }) => (
          <div key={title} className="flex items-start gap-5 p-6 rounded-2xl bg-white/[0.05] backdrop-blur-md border border-white/[0.08]">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15`, color }}>
              {icon}
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1.5 text-white/90">{title}</h3>
              <p className="text-sm leading-relaxed text-white/60">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
