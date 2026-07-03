export type ProposalStatus = "active" | "pending" | "executed" | "defeated" | "expired" | "canceled";

export type VoteType = "for" | "against" | "abstain";

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: ProposalStatus;
  for_votes: string;
  against_votes: string;
  abstain_votes: string;
  snapshot_block: string;
  start_time: string;
  end_time: string;
  quorum: string;
  executed_time: string | null;
  created_at: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
}

export interface CreateProposalPayload {
  title: string;
  description: string;
  targets?: string[];
  values?: string[];
  signatures?: string[];
  calldatas?: string[];
}

export interface VotePayload {
  proposal_id: string;
  vote: VoteType;
}

export interface ContractProposal {
  id: bigint;
  proposer: `0x${string}`;
  snapshotBlock: bigint;
  startTime: bigint;
  endTime: bigint;
  status: number;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  quorum: bigint;
  title: string;
  description: string;
  targets: readonly `0x${string}`[];
  values: readonly bigint[];
  signatures: readonly string[];
  calldatas: readonly `0x${string}`[];
}

