"use client";

import { useState, useEffect } from "react";
import { MS_PER_SECOND, MS_PER_HOUR, MS_PER_DAY } from "@/lib/constants";

export function TimeRemaining({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState<number>(() => Number(endTime) - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(Number(endTime) - Date.now()), MS_PER_SECOND);
    return () => clearInterval(interval);
  }, [endTime]);

  if (remaining <= 0) return <span className="text-white/40">Ended</span>;
  const days = Math.floor(remaining / MS_PER_DAY);
  const hours = Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR);
  return <span>{days}d {hours}h left</span>;
}

export function VoteBar({ forVotes, againstVotes, abstainVotes }: { forVotes: string; againstVotes: string; abstainVotes: string }) {
  const f = Number(forVotes);
  const a = Number(againstVotes);
  const ab = Number(abstainVotes);
  const total = f + a + ab || 1;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06]">
      <div className="bg-[#6EE7B7] transition-all" style={{ width: `${(f / total) * 100}%` }} />
      <div className="bg-red-400/60 transition-all" style={{ width: `${(a / total) * 100}%` }} />
      <div className="bg-white/20 transition-all" style={{ width: `${(ab / total) * 100}%` }} />
    </div>
  );
}
