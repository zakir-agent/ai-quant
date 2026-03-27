interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 32, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Hexagon outline (blockchain) */}
      <path
        d="M32 4L56 18V46L32 60L8 46V18L32 4Z"
        stroke="var(--accent-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
        opacity="0.3"
      />
      {/* Inner hexagon glow */}
      <path
        d="M32 10L50 21V43L32 54L14 43V21L32 10Z"
        stroke="var(--accent-primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="color-mix(in srgb, var(--accent-primary) 8%, transparent)"
      />

      {/* K-line candles (quantitative trading) */}
      {/* Candle 1 - bearish (short, red) */}
      <rect x="19" y="28" width="4" height="10" rx="0.5" fill="var(--accent-secondary)" opacity="0.8" />
      <line x1="21" y1="26" x2="21" y2="40" stroke="var(--accent-secondary)" strokeWidth="1" opacity="0.5" />

      {/* Candle 2 - bullish (tall, green/blue) */}
      <rect x="26" y="22" width="4" height="14" rx="0.5" fill="var(--accent-primary)" />
      <line x1="28" y1="19" x2="28" y2="38" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.6" />

      {/* Candle 3 - bullish (tallest, green/blue) */}
      <rect x="33" y="18" width="4" height="16" rx="0.5" fill="var(--accent-primary)" />
      <line x1="35" y1="15" x2="35" y2="36" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.6" />

      {/* Candle 4 - slight pullback */}
      <rect x="40" y="20" width="4" height="12" rx="0.5" fill="var(--accent-primary)" opacity="0.7" />
      <line x1="42" y1="18" x2="42" y2="34" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.4" />

      {/* AI neural network nodes */}
      <circle cx="21" cy="44" r="2.5" fill="var(--accent-secondary)" opacity="0.9" />
      <circle cx="35" cy="46" r="2.5" fill="var(--accent-primary)" opacity="0.9" />
      <circle cx="44" cy="42" r="2.5" fill="var(--accent-primary)" opacity="0.7" />

      {/* Neural connections */}
      <line x1="21" y1="44" x2="35" y2="46" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.3" />
      <line x1="35" y1="46" x2="44" y2="42" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.3" />
      <line x1="21" y1="44" x2="44" y2="42" stroke="var(--accent-secondary)" strokeWidth="0.8" opacity="0.2" strokeDasharray="2 2" />

      {/* Trend line (upward) */}
      <path
        d="M17 38L25 30L32 26L40 22L47 24"
        stroke="var(--accent-secondary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.4"
      />
    </svg>
  );
}
