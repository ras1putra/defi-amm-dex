interface LoadingProps {
  height?: string;
  className?: string;
}

export default function Loading({ height = "h-64", className = "" }: LoadingProps) {
  return (
    <div className={`rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden p-8 flex justify-center items-center ${height} ${className}`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6EE7B7]" />
    </div>
  );
}
