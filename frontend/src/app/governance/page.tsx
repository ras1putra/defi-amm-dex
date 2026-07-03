"use client";

import { useState, useEffect } from "react";
import { Plus, Hourglass, Vote } from "lucide-react";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { useProposals, useVote, useCurrentDelegate, useDelegate } from "@/hooks/useGovernance";
import type { ProposalStatus, VoteType } from "@/types/governance";
import Loading from "@/components/ui/Loading";
import AppNavbar from "@/components/layout/AppNavbar";
import ProposalCard from "@/components/governance/ProposalCard";
import CreateProposalModal from "@/components/governance/CreateProposalModal";
import { showErrorToast } from "@/lib/api";

const FILTER_OPTIONS: { label: string; value: ProposalStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Executed", value: "executed" },
  { label: "Defeated", value: "defeated" },
];

export default function GovernancePage() {
  const { address } = useAccount();
  const { data: proposals, isLoading, isError, error } = useProposals();
  const vote = useVote();
  const { data: currentDelegate, isLoading: isLoadingDelegate } = useCurrentDelegate();
  const delegateMutation = useDelegate();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");

  useEffect(() => {
    if (isError && error) showErrorToast(error, "Failed to load proposals");
  }, [isError, error]);

  const handleVote = async (id: string, voteType: VoteType) => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }
    try {
      const hash = await vote.mutateAsync({
        proposal_id: id,
        vote: voteType,
      });
      return hash;
    } catch (e) {
      showErrorToast(e, "Failed to cast vote");
      throw e;
    }
  };

  const handleSelfDelegate = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }
    try {
      await delegateMutation.mutateAsync(address);
    } catch (e) {
      showErrorToast(e, "Failed to self-delegate");
    }
  };

  const filtered = proposals?.filter((p) => filter === "all" || p.status === filter) ?? [];
  const isNotDelegated = currentDelegate === "0x0000000000000000000000000000000000000000";

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-syne">
      <AppNavbar title="Governance" />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-[#6EE7B7]/10 flex items-center justify-center">
                <Vote size={16} className="text-[#6EE7B7]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Governance</h1>
            </div>
            <p className="mt-2 text-white/70 font-mono-dm text-sm">{"// Propose changes and vote on protocol upgrades"}</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Plus size={16} /> Create
          </button>
        </div>

        {address && !isLoadingDelegate && (
          <div className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white/90">Voting Delegation</h3>
              <p className="text-sm text-white/70 mt-1 font-mono-dm">
                {isNotDelegated
                  ? "Your voting power is currently inactive. Self-delegate to activate your voting weight."
                  : `Delegated to: ${currentDelegate === address ? "Self (Active)" : currentDelegate}`}
              </p>
            </div>
            {isNotDelegated && (
              <button
                onClick={handleSelfDelegate}
                disabled={delegateMutation.isPending}
                className="px-4 py-2 text-sm font-bold bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/20 rounded-xl hover:bg-[#6EE7B7]/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {delegateMutation.isPending ? "Delegating..." : "Activate Voting Power"}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 text-sm font-mono-dm rounded-lg transition-colors cursor-pointer ${
                filter === opt.value
                  ? "bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/20"
                  : "text-white/70 hover:text-white border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Hourglass size={32} className="mx-auto text-white/20 mb-3" />
            <p className="text-sm text-white/40">No proposals found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} onVote={handleVote} />
            ))}
          </div>
        )}
      </main>

      {showCreate && <CreateProposalModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
