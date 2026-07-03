"use client";

const STEPS = [
  {
    step: "1",
    title: "Connect Wallet",
    desc: "Link your wallet and you're ready. No sign-ups, no emails, no KYC.",
  },
  {
    step: "2",
    title: "Swap or Add Liquidity",
    desc: "Trade any pair instantly or deposit into a pool to start earning fees.",
  },
  {
    step: "3",
    title: "Stake & Govern",
    desc: "Stake your tokens for yield. Vote on proposals. Shape the protocol.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-16 md:py-20 px-6 md:px-12 max-w-7xl mx-auto">
      <div className="mb-12">
        <h2 className="text-4xl md:text-5xl font-black tracking-tight">
          Three steps. Done.
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {STEPS.map(({ step, title, desc }) => (
          <div key={step} className="flex items-start gap-5 p-6 rounded-2xl bg-white/[0.05] backdrop-blur-md border border-white/[0.08]">
            <div className="w-10 h-10 rounded-xl bg-[#6EE7B7]/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-black text-[#6EE7B7]">{step}</span>
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
