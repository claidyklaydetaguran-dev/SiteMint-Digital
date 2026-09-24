/**
 * Frontend V3 — the luminous signal waveform used inside theaters.
 * Pure SVG decoration (aria-hidden); animation lives in CSS and collapses
 * under prefers-reduced-motion. Real content always overlays as DOM.
 */

export function SignalWave({ className }: { className?: string }) {
  return (
    <svg
      className={`v3m-signal${className ? ` ${className}` : ""}`}
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="v3m-signal__a"
        d="M0,100 C80,52 160,148 240,100 S400,44 480,100 S640,164 720,100 S880,40 960,100 S1120,152 1200,100"
      />
      <path
        className="v3m-signal__b"
        d="M0,110 C90,150 180,60 270,104 S450,158 540,104 S720,48 810,104 S990,156 1080,104 S1160,80 1200,96"
      />
      <path
        className="v3m-signal__c"
        d="M0,96 C150,120 300,84 450,102 S750,116 900,98 S1100,88 1200,104"
      />
    </svg>
  );
}

export default SignalWave;
