"use client";

import { Vote, FileText, Users, Shield } from "lucide-react";

const FEATURES = [
  {
    icon: <FileText size={22} />,
    title: "Proposals",
    desc: "Submit improvement proposals. Discuss and refine with the community before voting.",
  },
  {
    icon: <Vote size={22} />,
    title: "On-chain Voting",
    desc: "Vote directly from your wallet. No gas fees for voting.",
  },
  {
    icon: <Users size={22} />,
    title: "Delegation",
    desc: "Delegate your voting power to trusted community members if you prefer.",
  },
  {
    icon: <Shield size={22} />,
    title: "Timelock",
    desc: "Approved proposals go through a timelock for community review before execution.",
  },
];

export default function Governance() {
  return (
    <section className="py-16 md:py-20 px-6 md:px-12 max-w-7xl mx-auto">
      <div className="mb-12">
        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
          Your voice. <span className="stat-number">Your vote.</span>
        </h2>
        <p className="text-white/70 mt-3 max-w-md">
          Hold tokens to propose changes, vote on upgrades, and help steer the protocol.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {FEATURES.map(({ icon, title, desc }) => (
          <div key={title} className="flex items-start gap-5 p-6 rounded-2xl bg-white/[0.05] backdrop-blur-md border border-white/[0.08]">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[#F59E0B]/10 text-[#F59E0B]">
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
