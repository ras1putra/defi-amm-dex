"use client";

import { useState, useEffect } from "react";
import { Clock, CheckCircle, ThumbsUp, ThumbsDown, Minus, Loader2, AlertTriangle } from "lucide-react";
import type { Proposal, VoteType } from "@/types/governance";
import { GOVERNANCE_STATUS_LABELS, GOVERNANCE_STATUS_COLORS } from "@/lib/constants";
import { useExecuteProposal, useVotingPower, useHasVoted } from "@/hooks/useGovernance";
import { useConfigStore } from "@/store/useConfigStore";
import { useAccount } from "wagmi";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";
import { formatVotes } from "@/lib/format";
import { TimeRemaining, VoteBar } from "./VoteWidgets";

interface ProposalCardProps {
  proposal: Proposal;
  onVote: (id: string, vote: VoteType) => Promise<`0x${string}` | undefined>;
}

export default function ProposalCard({ proposal, onVote }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const execute = useExecuteProposal();
  const { data: voted } = useHasVoted(expanded ? proposal.id : null);
  const { data: votingPower } = useVotingPower(expanded ? proposal.snapshot_block : null);
  const { address } = useAccount();

  const [votingEnded, setVotingEnded] = useState(() => Date.now() > Number(proposal.end_time));
  const [confirmingVote, setConfirmingVote] = useState<VoteType | null>(null);
  const [isVotingLoading, setIsVotingLoading] = useState(false);
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);
  const [votedType, setVotedType] = useState<VoteType | null>(null);
  const [hasVotedLocally, setHasVotedLocally] = useState(false);
  const userAlreadyVoted = voted || hasVotedLocally;

  // Reset local vote state when wallet address changes
  const [trackedAddress, setTrackedAddress] = useState(address);
  if (trackedAddress !== address) {
    setTrackedAddress(address);
    setHasVotedLocally(false);
    setSuccessTxHash(null);
    setVotedType(null);
  }

  useEffect(() => {
    if (votingEnded) return;
    const interval = setInterval(() => {
      const ended = Date.now() > Number(proposal.end_time);
      if (ended) {
        setVotingEnded(true);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [proposal.end_time, votingEnded]);

  const canExecute = proposal.status === "active" && votingEnded;

  const handleExecute = async () => {
    try {
      await execute.mutateAsync(proposal.id);
    } catch {
      // toast handled by parent or wagmi
    }
  };

  const handleConfirmVote = async () => {
    if (!confirmingVote) return;
    setIsVotingLoading(true);
    try {
      const hash = await onVote(proposal.id, confirmingVote);
      setVotedType(confirmingVote);
      setSuccessTxHash((hash as string) || null);
      setHasVotedLocally(true);
      setConfirmingVote(null);
    } catch {
      // Error is already toasted by parent
    } finally {
      setIsVotingLoading(false);
    }
  };

  const shortProposer = proposal.proposer
    ? `${proposal.proposer.slice(0, 6)}...${proposal.proposer.slice(-4)}`
    : "Unknown";

  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.12] transition-all overflow-hidden">
      {/* Clickable Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-6 hover:bg-white/[0.01] transition-colors cursor-pointer"
      >
        <div className="flex flex-col gap-3">
          {/* Top Row: Proposer & Status */}
          <div className="flex items-center justify-between text-xs font-mono-dm text-white/40">
            <span>
              Proposed by: <span className="text-white/70 font-semibold">{shortProposer}</span>
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full ${GOVERNANCE_STATUS_COLORS[proposal.status]}`}>
              {GOVERNANCE_STATUS_LABELS[proposal.status]}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-bold text-white/95 leading-snug text-lg mt-1">{proposal.title}</h3>

          {/* Vote Bar */}
          <div className="mt-2">
            <VoteBar forVotes={proposal.for_votes} againstVotes={proposal.against_votes} abstainVotes={proposal.abstain_votes} />
          </div>

          {/* Collapsed Details Footer */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-xs font-mono-dm text-white/70 border-t border-white/[0.03] pt-3">
            {proposal.status === "active" && (
              <span className="flex items-center gap-1.5 text-white/60">
                <Clock size={12} />
                <TimeRemaining endTime={proposal.end_time} />
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <ThumbsUp size={12} className="text-[#6EE7B7]" />
              For: <span className="text-white/80 font-bold">{formatVotes(proposal.for_votes)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <ThumbsDown size={12} className="text-red-400/60" />
              Against: <span className="text-white/80 font-bold">{formatVotes(proposal.against_votes)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Minus size={12} className="text-white/70" />
              Abstain: <span className="text-white/80 font-bold">{formatVotes(proposal.abstain_votes)}</span>
            </span>
            <span className="ml-auto text-white/40">
              Quorum: <span className="text-white/75 font-semibold">{((Number(proposal.for_votes) + Number(proposal.against_votes) + Number(proposal.abstain_votes)) / Number(proposal.quorum) * 100).toFixed(0)}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Details Body */}
      {expanded && (
        <div className="px-6 pb-6 border-t border-white/[0.06] pt-5 space-y-5 bg-white/[0.01]">
          <div className="space-y-1.5">
            <h4 className="text-xs font-mono-dm text-white/40 uppercase tracking-widest">Description</h4>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{proposal.description}</p>
          </div>

          {/* Detailed vote distribution */}
          <div className="grid grid-cols-3 gap-3 text-sm font-mono-dm">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <p className="text-white/40 mb-1 text-xs">For</p>
              <p className="text-[#6EE7B7] font-bold text-base">{formatVotes(proposal.for_votes)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <p className="text-white/40 mb-1 text-xs">Against</p>
              <p className="text-red-400/60 font-bold text-base">{formatVotes(proposal.against_votes)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <p className="text-white/40 mb-1 text-xs">Abstain</p>
              <p className="text-white/70 font-bold text-base">{formatVotes(proposal.abstain_votes)}</p>
            </div>
          </div>

          {/* Vote Ratio Progress Bar */}
          {(() => {
            const f = BigInt(proposal.for_votes);
            const a = BigInt(proposal.against_votes);
            const ab = BigInt(proposal.abstain_votes);
            const total = f + a + ab;
            
            const fPct = total > 0n ? Number(f * 100n / total) : 0;
            const aPct = total > 0n ? Number(a * 100n / total) : 0;
            const abPct = total > 0n ? Number(ab * 100n / total) : 0;
            
            return (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs font-mono-dm text-white/40">
                  <span>VOTES RATIO</span>
                  <span>{fPct}% For / {aPct}% Against</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/[0.04] overflow-hidden flex">
                  {total > 0n ? (
                    <>
                      {fPct > 0 && <div className="h-full bg-[#6EE7B7] transition-all duration-500" style={{ width: `${fPct}%` }} />}
                      {aPct > 0 && <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${aPct}%` }} />}
                      {abPct > 0 && <div className="h-full bg-white/20 transition-all duration-500" style={{ width: `${abPct}%` }} />}
                    </>
                  ) : (
                    <div className="h-full w-full bg-white/[0.04]" />
                  )}
                </div>
              </div>
            );
          })()}

          {/* Quorum Progress Bar */}
          {(() => {
            const f = BigInt(proposal.for_votes);
            const a = BigInt(proposal.against_votes);
            const ab = BigInt(proposal.abstain_votes);
            const total = f + a + ab;
            const quorum = BigInt(proposal.quorum);
            
            const quorumPct = quorum > 0n ? Number(total * 100n / quorum) : 0;
            const displayPct = Math.min(100, quorumPct);
            const quorumMet = total >= quorum;
            
            return (
              <div className="space-y-1.5 border-t border-white/[0.04] pt-3">
                <div className="flex justify-between text-xs font-mono-dm text-white/40">
                  <span>QUORUM THRESHOLD ({formatVotes(proposal.quorum)} SURL)</span>
                  <span className={quorumMet ? "text-[#6EE7B7] font-bold" : "text-white/60"}>
                    {quorumPct}% {quorumMet ? "(MET)" : ""}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/[0.04] overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${quorumMet ? "bg-[#6EE7B7]" : "bg-blue-400/60"}`} 
                    style={{ width: `${displayPct}%` }} 
                  />
                </div>
              </div>
            );
          })()}

          {/* Proposer Info */}
          <div className="flex flex-wrap items-center justify-between text-xs text-white/70 font-mono-dm p-3 rounded-xl bg-white/[0.01] border border-white/[0.04]">
            <span>Full Proposer Address: <span className="text-white/80 select-all font-mono-dm">{proposal.proposer}</span></span>
            {proposal.executed_time && (
              <span className="flex items-center gap-1 text-blue-400">
                <CheckCircle size={12} />
                Executed {new Date(Number(proposal.executed_time)).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Proposed Actions */}
          {proposal.targets && proposal.targets.length > 0 && (
            <div className="space-y-2 mt-2 pt-3 border-t border-white/[0.04]">
              <h4 className="text-xs font-mono-dm text-white/40 uppercase tracking-widest">Proposed Actions</h4>
              <div className="space-y-1.5 font-mono-dm text-xs text-white/60">
                {proposal.targets.map((target, index) => {
                  const sig = proposal.signatures?.[index] || "Raw Call";
                  const valStr = proposal.values?.[index] ? `${proposal.values[index]} wei` : "0 wei";
                  return (
                    <div key={index} className="p-3 rounded-xl bg-white/[0.01] border border-white/[0.04] space-y-1">
                      <div className="flex justify-between font-bold text-white/80">
                        <span className="text-[#6EE7B7]">{sig}</span>
                        <span>{valStr}</span>
                      </div>
                      <div className="text-white/40 truncate text-[11px]">Target: {target}</div>
                      {proposal.calldatas?.[index] && proposal.calldatas[index] !== "0x" && (
                        <div className="text-white/70 text-[10px] break-all truncate">
                          Calldata: {proposal.calldatas[index]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User Voting Power & Actions */}
          {proposal.status === "active" && (
            <div className="pt-3 border-t border-white/[0.04] space-y-4">
              <div className="flex justify-between items-center text-sm font-mono-dm">
                {votingPower != null && (
                  <span className="text-white/70">
                    Your voting weight: <span className="text-[#6EE7B7] font-bold">{formatVotes(votingPower)} SURL</span>
                  </span>
                )}
                {userAlreadyVoted && (
                  <span className="text-white/40 flex items-center gap-1">
                    <CheckCircle size={12} className="text-[#6EE7B7]" /> You already voted
                  </span>
                )}
              </div>

              {!userAlreadyVoted && (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingVote("for")} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/20 hover:bg-[#6EE7B7]/20 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <ThumbsUp size={14} /> For
                  </button>
                  <button onClick={() => setConfirmingVote("against")} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <ThumbsDown size={14} /> Against
                  </button>
                  <button onClick={() => setConfirmingVote("abstain")} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.1] transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <Minus size={14} /> Abstain
                  </button>
                </div>
              )}
            </div>
          )}

          {canExecute && (
            <button
              onClick={handleExecute}
              disabled={execute.isPending}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {execute.isPending ? <><Loader2 size={14} className="animate-spin" /> Executing...</> : <><CheckCircle size={14} /> Execute Proposal</>}
            </button>
          )}
        </div>
      )}

      {confirmingVote && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !isVotingLoading && setConfirmingVote(null)}
        >
          <div 
            className="rounded-2xl bg-[#0A0A0A] border border-white/[0.08] p-6 w-full max-w-sm space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-white/95">
              <AlertTriangle className="text-[#6EE7B7]" size={20} />
              <h3 className="text-base font-bold font-syne">Confirm Vote</h3>
            </div>
            <p className="text-sm text-white/60 font-mono-dm leading-relaxed">
              Are you sure you want to cast a vote of <span className="font-bold text-[#6EE7B7] uppercase">{confirmingVote}</span> on this proposal?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmingVote(null)}
                disabled={isVotingLoading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVote}
                disabled={isVotingLoading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#6EE7B7] text-[#0A0A0A] hover:bg-[#6EE7B7]/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isVotingLoading ? <Loader2 size={14} className="animate-spin" /> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successTxHash && (
        <TxConfirmedModal
          title="Vote Submitted!"
          subtitle="Your vote has been cast successfully."
          details={[
            { label: "Proposal", value: proposal.title },
            { label: "Vote Cast", value: votedType ?? "", highlight: true },
            ...(votingPower != null ? [{ label: "Voting Weight", value: `${formatVotes(votingPower)} SURL` }] : []),
          ]}
          txHash={successTxHash}
          explorerUrl={explorerUrl}
          onClose={() => setSuccessTxHash(null)}
        />
      )}
    </div>
  );
}
