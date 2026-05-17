"use client";

interface SentimentGaugeProps {
  score: number;
  size?: number;
}

export default function SentimentGauge({ score, size = 120 }: SentimentGaugeProps) {
  const clamped = Math.max(-100, Math.min(100, score));
  const angle = ((clamped + 100) / 200) * 180 - 90;
  const radius = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2 + 5;

  const color =
    clamped > 30 ? "var(--success)" : clamped < -30 ? "var(--danger)" : "var(--warning)";

  const needleLen = radius - 8;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + needleLen * Math.cos(Math.PI - rad);
  const ny = cy - needleLen * Math.sin(Math.PI - rad);

  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
      {/* Background arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="var(--bg-primary)"
        strokeWidth={8}
        strokeLinecap="round"
      />
      {/* Red segment (left half) */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx} ${cy - radius}`}
        fill="none"
        stroke="var(--danger)"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.6}
      />
      {/* Yellow segment (center) */}
      <path
        d={`M ${cx - radius * 0.3} ${cy - radius * 0.95} A ${radius} ${radius} 0 0 1 ${cx + radius * 0.3} ${cy - radius * 0.95}`}
        fill="none"
        stroke="var(--warning)"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.6}
      />
      {/* Green segment (right half) */}
      <path
        d={`M ${cx} ${cy - radius} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="var(--success)"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.6}
      />
      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={4} fill={color} />
    </svg>
  );
}
