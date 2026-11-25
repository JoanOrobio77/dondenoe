export function Wordmark({ className = "text-5xl" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline leading-none ${className}`}>
      <span className="font-display italic font-semibold tracking-tight text-[#e10600]">Donde</span>
      <span className="-ml-[0.07em] font-sans font-extrabold tracking-tight text-black">Noe</span>
    </span>
  );
}
