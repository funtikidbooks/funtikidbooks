// Renders "Funti" in the Mochido display font with the exact per-letter
// colors sampled from the studio's own logo (public/brand/funti-logo.jpg):
// F/t teal, u/i pink, n orange.
export function FuntiWordmark({ className }: { className?: string }) {
  return (
    <span className={`fk-funti-wordmark ${className ?? ""}`}>
      <span className="fk-funti-teal">F</span>
      <span className="fk-funti-pink">u</span>
      <span className="fk-funti-orange">n</span>
      <span className="fk-funti-teal">t</span>
      <span className="fk-funti-pink">i</span>
    </span>
  );
}
