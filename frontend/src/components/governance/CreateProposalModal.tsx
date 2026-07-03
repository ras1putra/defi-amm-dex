"use client";

import { useAccount } from "wagmi";
import { X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateProposal, useProposalThreshold, useProposerVotingPower } from "@/hooks/useGovernance";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { proposalSchema, type ProposalFormValues } from "@/schema/proposal";
import { showErrorToast } from "@/lib/api";
import { useState } from "react";

interface ActionItem {
  target: string;
  value: string;
  signature: string;
  calldata: string;
}

export default function CreateProposalModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const createProposal = useCreateProposal();
  const { data: threshold } = useProposalThreshold();
  const { data: votingPower } = useProposerVotingPower();
  const isBelowThreshold = !!address && votingPower !== undefined && threshold !== null && threshold !== undefined && votingPower < threshold;
  const [actions, setActions] = useState<ActionItem[]>([]);

  const { register, handleSubmit, formState: { errors } } = useForm<ProposalFormValues>({
    resolver: zodResolver(proposalSchema),
    defaultValues: { title: "", description: "" },
  });

  const addAction = () => {
    setActions([...actions, { target: "", value: "0", signature: "", calldata: "0x" }]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, key: keyof ActionItem, val: string) => {
    setActions(
      actions.map((act, i) => (i === index ? { ...act, [key]: val } : act))
    );
  };

  const onSubmit = async (values: ProposalFormValues) => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    // Validate actions
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      if (!act.target.startsWith("0x") || act.target.length !== 42) {
        toast.error(`Action ${i + 1}: Invalid target address`);
        return;
      }
      if (!act.calldata.startsWith("0x")) {
        toast.error(`Action ${i + 1}: Calldata must start with 0x`);
        return;
      }
      if (isNaN(Number(act.value))) {
        toast.error(`Action ${i + 1}: Value must be a valid number`);
        return;
      }
    }

    try {
      await createProposal.mutateAsync({
        title: values.title,
        description: values.description,
        targets: actions.map((a) => a.target),
        values: actions.map((a) => a.value),
        signatures: actions.map((a) => a.signature),
        calldatas: actions.map((a) => a.calldata),
      });
      onClose();
    } catch (e) {
      showErrorToast(e, "Failed to submit proposal");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="my-8 rounded-2xl bg-[#0A0A0A] border border-white/[0.08] p-4 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white/90">Create Proposal</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-mono-dm text-white/70 uppercase tracking-widest mb-1.5 block">Title</label>
            <input
              {...register("title")}
              placeholder="e.g. Reduce swap fee to 0.25%"
              className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm outline-none placeholder:text-white/20 focus:border-white/20 transition-colors"
            />
            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label className="text-sm font-mono-dm text-white/70 uppercase tracking-widest mb-1.5 block">Description</label>
            <textarea
              {...register("description")}
              placeholder="Describe your proposal in detail..."
              rows={4}
              className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm outline-none placeholder:text-white/20 focus:border-white/20 transition-colors resize-none"
            />
            {errors.description && <p className="text-xs text-red-400 mt-1">{errors.description.message}</p>}
          </div>

          <div className="border-t border-white/[0.08] pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white/70">Proposed Actions</h3>
              <button
                type="button"
                onClick={addAction}
                className="text-xs font-bold font-mono-dm text-[#6EE7B7] hover:underline cursor-pointer"
              >
                + Add Action
              </button>
            </div>

            {actions.length === 0 ? (
              <p className="text-xs text-white/70 italic">No actions proposed. This proposal will be text-only.</p>
            ) : (
              <div className="space-y-4">
                {actions.map((act, index) => (
                  <div key={index} className="p-4 rounded-xl bg-white/[0.01] border border-white/[0.04] space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white/70 font-mono-dm uppercase tracking-wider">Action #{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeAction(index)}
                        className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                        title="Remove action"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono-dm text-white/40 uppercase tracking-wider block mb-1">Target Address</label>
                        <input
                          type="text"
                          value={act.target}
                          onChange={(e) => updateAction(index, "target", e.target.value)}
                          placeholder="0x..."
                          className="w-full p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white text-xs outline-none placeholder:text-white/10 focus:border-white/15 transition-colors font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono-dm text-white/40 uppercase tracking-wider block mb-1">Value (wei)</label>
                        <input
                          type="text"
                          value={act.value}
                          onChange={(e) => updateAction(index, "value", e.target.value)}
                          placeholder="0"
                          className="w-full p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white text-xs outline-none placeholder:text-white/10 focus:border-white/15 transition-colors font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono-dm text-white/40 uppercase tracking-wider block mb-1">Signature (optional)</label>
                        <input
                          type="text"
                          value={act.signature}
                          onChange={(e) => updateAction(index, "signature", e.target.value)}
                          placeholder="e.g. transfer(address,uint256)"
                          className="w-full p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white text-xs outline-none placeholder:text-white/10 focus:border-white/15 transition-colors font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono-dm text-white/40 uppercase tracking-wider block mb-1">Calldata (hex)</label>
                        <input
                          type="text"
                          value={act.calldata}
                          onChange={(e) => updateAction(index, "calldata", e.target.value)}
                          placeholder="0x..."
                          className="w-full p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white text-xs outline-none placeholder:text-white/10 focus:border-white/15 transition-colors font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isBelowThreshold && (
          <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5 mt-4 text-center font-mono-dm">
            Warning: Your voting power ({Number(votingPower / 1000000000000000000n).toLocaleString()} SURL) is below the proposal threshold ({Number(threshold / 1000000000000000000n).toLocaleString()} SURL). You cannot submit a proposal.
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={createProposal.isPending || isBelowThreshold}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#6EE7B7] text-[#0A0A0A] hover:bg-[#6EE7B7]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {createProposal.isPending ? "Submitting..." : "Submit Proposal"}
          </button>
        </div>
      </form>
    </div>
  );
}
