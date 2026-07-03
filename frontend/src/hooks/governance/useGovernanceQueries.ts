import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { V2_GOVERNOR_ABI, GET_PAST_VOTES_ABI, DELEGATES_ABI, GET_VOTES_ABI } from "@/lib/abis";
import { useConfigStore } from "@/store/useConfigStore";
import { mapContractProposal } from "@/lib/governance-helpers";
import type { ContractProposal } from "@/types/governance";

export function useProposals() {
  const publicClient = usePublicClient();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["proposals", governorAddress],
    queryFn: async () => {
      if (!governorAddress || !publicClient) return [];

      const proposalsLength = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "proposalsLength",
      });

      const promises = [];
      for (let i = 0; i < Number(proposalsLength); i++) {
        promises.push(
          publicClient.readContract({
            address: governorAddress,
            abi: V2_GOVERNOR_ABI,
            functionName: "getProposal",
            args: [BigInt(i)],
          })
          .then((res) => ({ status: "success" as const, result: res }))
          .catch(() => ({ status: "failure" as const, result: null }))
        );
      }

      if (promises.length === 0) return [];

      const results = await Promise.all(promises);
      
      return results
        .filter((r) => r.status === "success" && r.result)
        .map((r) => mapContractProposal(r.result as unknown as ContractProposal));
    },
    enabled: !!governorAddress && !!publicClient,
    staleTime: 30000,
  });
}

export function useProposal(id: string) {
  const publicClient = usePublicClient();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["proposal", id, governorAddress],
    queryFn: async () => {
      if (!governorAddress || !publicClient || !id) return null;

      const p = (await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "getProposal",
        args: [BigInt(id)],
      })) as unknown as ContractProposal;

      return mapContractProposal(p);
    },
    enabled: !!governorAddress && !!publicClient && !!id,
  });
}

export function useVotingPower(snapshotBlock: string | null) {
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["votingPower", governorAddress, snapshotBlock, userAddress],
    queryFn: async () => {
      if (!publicClient || !governorAddress || !userAddress || !snapshotBlock) return null;

      const tokenAddress = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "token",
      });

      const weight = await publicClient.readContract({
        address: tokenAddress,
        abi: [GET_PAST_VOTES_ABI],
        functionName: "getPastVotes",
        args: [userAddress, BigInt(snapshotBlock)],
      });

      return weight;
    },
    enabled: !!publicClient && !!governorAddress && !!userAddress && !!snapshotBlock,
    staleTime: 30000,
  });
}

export function useHasVoted(proposalId: string | null) {
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["hasVoted", governorAddress, proposalId, userAddress],
    queryFn: async () => {
      if (!publicClient || !governorAddress || !userAddress || !proposalId) return false;

      const voted = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "hasVoted",
        args: [BigInt(proposalId), userAddress],
      });

      return voted;
    },
    enabled: !!publicClient && !!governorAddress && !!userAddress && !!proposalId,
    staleTime: 30000,
  });
}

export function useCurrentDelegate() {
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["currentDelegate", governorAddress, userAddress],
    queryFn: async () => {
      if (!publicClient || !governorAddress || !userAddress) return null;

      const tokenAddress = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "token",
      });

      const currentDelegate = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: DELEGATES_ABI,
        functionName: "delegates",
        args: [userAddress],
      });

      return currentDelegate as string;
    },
    enabled: !!publicClient && !!governorAddress && !!userAddress,
    staleTime: 30000,
  });
}

export function useProposalThreshold() {
  const publicClient = usePublicClient();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["proposalThreshold", governorAddress],
    queryFn: async () => {
      if (!publicClient || !governorAddress) return null;

      const threshold = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "proposalThreshold",
      });

      return threshold as bigint;
    },
    enabled: !!publicClient && !!governorAddress,
    staleTime: 30000,
  });
}

export function useProposerVotingPower() {
  const publicClient = usePublicClient();
  const { address: userAddress } = useAccount();
  const config = useConfigStore((s) => s.config);
  const governorAddress = config?.contract_governor as `0x${string}`;

  return useQuery({
    queryKey: ["proposerVotingPower", governorAddress, userAddress],
    queryFn: async () => {
      if (!publicClient || !governorAddress || !userAddress) return 0n;

      const tokenAddress = await publicClient.readContract({
        address: governorAddress,
        abi: V2_GOVERNOR_ABI,
        functionName: "token",
      });

      const weight = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: GET_VOTES_ABI,
        functionName: "getVotes",
        args: [userAddress],
      });

      return weight as bigint;
    },
    enabled: !!publicClient && !!governorAddress && !!userAddress,
    staleTime: 10000,
  });
}
