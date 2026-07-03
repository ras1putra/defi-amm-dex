import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { txToast } from "@/components/dex/TxToast";
import { V2_GOVERNOR_ABI, DELEGATE_ABI } from "@/lib/abis";
import { useConfigStore } from "@/store/useConfigStore";

export function useCreateProposal() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description: string;
      targets?: string[];
      values?: string[];
      signatures?: string[];
      calldatas?: string[];
    }) => {
      if (!governorAddress || !publicClient) throw new Error("Governor contract address not configured");
      const targets = (payload.targets ?? []).map((t) => t as `0x${string}`);
      const values = (payload.values ?? []).map((v) => BigInt(v));
      const signatures = payload.signatures ?? [];
      const calldatas = (payload.calldatas ?? []).map((c) => c as `0x${string}`);

      const hash = await writeContractAsync({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "propose",
        args: [targets, values, signatures, calldatas, payload.title, payload.description],
      });

      txToast({
        hash,
        status: "pending",
        message: `Creating proposal: ${payload.title}...`,
        txType: "propose",
        sender: address,
      });

      try {
        await publicClient.waitForTransactionReceipt({ hash });
        txToast({
          hash,
          status: "success",
          message: "Proposal created successfully!",
          txType: "propose",
          sender: address,
        });
      } catch (err) {
        txToast({
          hash,
          status: "error",
          message: "Failed to create proposal",
          txType: "propose",
          sender: address,
        });
        throw err;
      }

      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useVote() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (payload: { proposal_id: string; vote: "for" | "against" | "abstain" }) => {
      if (!governorAddress || !publicClient) throw new Error("Governor contract address not configured");
      const voteMap = { against: 0, for: 1, abstain: 2 };
      const voteType = voteMap[payload.vote];

      const hash = await writeContractAsync({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "castVote",
        args: [BigInt(payload.proposal_id), voteType],
      });

      txToast({
        hash,
        status: "pending",
        message: `Casting vote ${payload.vote.toUpperCase()}...`,
        txType: "vote",
        sender: address,
      });

      try {
        await publicClient.waitForTransactionReceipt({ hash });
        txToast({
          hash,
          status: "success",
          message: `Voted ${payload.vote.toUpperCase()} successfully!`,
          txType: "vote",
          sender: address,
        });
      } catch (err) {
        txToast({
          hash,
          status: "error",
          message: "Voting failed",
          txType: "vote",
          sender: address,
        });
        throw err;
      }

      return hash;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["proposal", variables.proposal_id] });
      queryClient.invalidateQueries({ queryKey: ["hasVoted"] });
    },
  });
}

export function useExecuteProposal() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      if (!governorAddress || !publicClient) throw new Error("Governor contract address not configured");
      const hash = await writeContractAsync({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "execute",
        args: [BigInt(proposalId)],
      });

      txToast({
        hash,
        status: "pending",
        message: `Executing proposal #${proposalId}...`,
        txType: "execute",
        sender: address,
      });

      try {
        await publicClient.waitForTransactionReceipt({ hash });
        txToast({
          hash,
          status: "success",
          message: `Proposal #${proposalId} executed successfully!`,
          txType: "execute",
          sender: address,
        });
      } catch (err) {
        txToast({
          hash,
          status: "error",
          message: "Proposal execution failed",
          txType: "execute",
          sender: address,
        });
        throw err;
      }

      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useCancelProposal() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      if (!governorAddress || !publicClient) throw new Error("Governor contract address not configured");
      const hash = await writeContractAsync({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "cancel",
        args: [BigInt(proposalId)],
      });

      txToast({
        hash,
        status: "pending",
        message: `Canceling proposal #${proposalId}...`,
        txType: "cancel",
        sender: address,
      });

      try {
        await publicClient.waitForTransactionReceipt({ hash });
        txToast({
          hash,
          status: "success",
          message: `Proposal #${proposalId} canceled successfully!`,
          txType: "cancel",
          sender: address,
        });
      } catch (err) {
        txToast({
          hash,
          status: "error",
          message: "Failed to cancel proposal",
          txType: "cancel",
          sender: address,
        });
        throw err;
      }

      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}

export function useDelegate() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (delegatee: string) => {
      if (!governorAddress || !publicClient) throw new Error("Not initialized");

      const tokenAddress = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "token",
      });

      const hash = await writeContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: DELEGATE_ABI,
        functionName: "delegate",
        args: [delegatee as `0x${string}`],
      });

      const isSelf = delegatee.toLowerCase() === address?.toLowerCase();
      const label = isSelf ? "Self-delegating voting power..." : `Delegating votes to ${delegatee.slice(0, 6)}...`;

      txToast({
        hash,
        status: "pending",
        message: label,
        txType: "delegate",
        sender: address,
      });

      try {
        await publicClient.waitForTransactionReceipt({ hash });
        txToast({
          hash,
          status: "success",
          message: isSelf ? "Self-delegation successful!" : "Delegation successful!",
          txType: "delegate",
          sender: address,
        });
      } catch (err) {
        txToast({
          hash,
          status: "error",
          message: "Delegation failed",
          txType: "delegate",
          sender: address,
        });
        throw err;
      }

      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentDelegate"] });
      queryClient.invalidateQueries({ queryKey: ["votingPower"] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
}
