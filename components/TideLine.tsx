export default function TideLine() {
  return (
    <div className="tide-line" aria-hidden="true">
      <svg viewBox="0 0 2400 300" preserveAspectRatio="none" fill="none">
        <path
          d="M0 150 C 200 80, 400 220, 600 150 C 800 80, 1000 220, 1200 150 C 1400 80, 1600 220, 1800 150 C 2000 80, 2200 220, 2400 150 L 2400 300 L 0 300 Z"
          fill="#2DD4BF"
        />
        <path
          d="M2400 150 C 2600 80, 2800 220, 3000 150 C 3200 80, 3400 220, 3600 150 C 3800 80, 4000 220, 4200 150 C 4400 80, 4600 220, 4800 150 L 4800 300 L 2400 300 Z"
          fill="#2DD4BF"
        />
      </svg>
    </div>
  );
}
