import { Loader2, Check, X } from "lucide-react";

export const TX_VISUAL = {
  DONE: "done",
  ACTIVE: "active",
  PENDING: "pending",
  IDLE: "idle",
  ERROR: "error",
} as const;

type TxVisualStatus = (typeof TX_VISUAL)[keyof typeof TX_VISUAL];

interface TxStepProps {
  label: string;
  status: TxVisualStatus;
}

function TxStep({ label, status }: TxStepProps) {
  const icons: Record<TxVisualStatus, React.ReactNode> = {
    [TX_VISUAL.DONE]: <Check size={14} className="text-[#6EE7B7]" />,
    [TX_VISUAL.ACTIVE]: <Loader2 size={14} className="text-[#6EE7B7] animate-spin" />,
    [TX_VISUAL.PENDING]: <div className="w-3.5 h-3.5 rounded-full border border-white/20" />,
    [TX_VISUAL.IDLE]: <div className="w-3.5 h-3.5 rounded-full border border-white/10" />,
    [TX_VISUAL.ERROR]: <X size={14} className="text-red-400" />,
  };

  const colors: Record<TxVisualStatus, string> = {
    [TX_VISUAL.DONE]: "text-[#6EE7B7]",
    [TX_VISUAL.ACTIVE]: "text-[#6EE7B7]",
    [TX_VISUAL.PENDING]: "text-white/60",
    [TX_VISUAL.IDLE]: "text-white/70",
    [TX_VISUAL.ERROR]: "text-red-400",
  };

  return (
    <div className="flex items-center gap-2">
      {icons[status]}
      <span className={`text-xs font-mono-dm ${colors[status]}`}>{label}</span>
    </div>
  );
}

interface TransactionStatusProps {
  needsApproval: boolean;
  approveStatus: TxVisualStatus;
  isSigning: boolean;
  isPending: boolean;
  isConfirmed: boolean;
  isError: boolean;
}

export default function TransactionStatus({
  needsApproval,
  approveStatus,
  isSigning,
  isPending,
  isConfirmed,
  isError,
}: TransactionStatusProps) {
  const approve: TxVisualStatus = approveStatus === TX_VISUAL.DONE ? TX_VISUAL.DONE : isSigning && needsApproval ? TX_VISUAL.ACTIVE : isError && needsApproval ? TX_VISUAL.ERROR : needsApproval ? TX_VISUAL.IDLE : TX_VISUAL.DONE;

  const swapSigned = !needsApproval || approveStatus === TX_VISUAL.DONE;
  const swap: TxVisualStatus = isConfirmed ? TX_VISUAL.DONE : isPending ? TX_VISUAL.ACTIVE : isSigning && swapSigned ? TX_VISUAL.ACTIVE : isError && !needsApproval ? TX_VISUAL.ERROR : TX_VISUAL.IDLE;

  const confirm: TxVisualStatus = isConfirmed ? TX_VISUAL.DONE : isPending ? TX_VISUAL.ACTIVE : TX_VISUAL.IDLE;

  if (!needsApproval && !isSigning && !isPending && !isConfirmed && !isError) return null;

  return (
    <div className="mt-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.03] space-y-2">
      {needsApproval && <TxStep label="Approve token" status={approve} />}
      <TxStep label="Sign swap" status={swap} />
      <TxStep label="Confirm transaction" status={confirm} />
    </div>
  );
}
