import type { Proposal, ProposalStatus, ContractProposal } from "@/types/governance";

export function mapContractProposal(p: ContractProposal): Proposal {
  const statusEnum: ProposalStatus[] = ["active", "defeated", "executed", "expired", "canceled"];
  const statusStr = statusEnum[Number(p.status)] || "active";
  return {
    id: p.id.toString(),
    title: p.title,
    description: p.description,
    proposer: p.proposer,
    status: statusStr,
    for_votes: p.forVotes.toString(),
    against_votes: p.againstVotes.toString(),
    abstain_votes: p.abstainVotes.toString(),
    snapshot_block: p.snapshotBlock.toString(),
    start_time: (Number(p.startTime) * 1000).toString(),
    end_time: (Number(p.endTime) * 1000).toString(),
    quorum: p.quorum.toString(),
    executed_time: Number(p.status) === 2 ? (Number(p.endTime) * 1000).toString() : null,
    created_at: (Number(p.startTime) * 1000).toString(),
    targets: p.targets.map((t) => t.toString()),
    values: p.values.map((v) => v.toString()),
    signatures: p.signatures.map((s) => s.toString()),
    calldatas: p.calldatas.map((c) => c.toString()),
  };
}
