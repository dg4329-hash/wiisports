export default function PaddleProp() {
  return (
    <svg className="paddle-svg" viewBox="0 0 200 240" fill="none">
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fdcff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="pgFace" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="rgba(34,211,238,0.18)" />
          <stop offset="1" stopColor="rgba(34,211,238,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="92" rx="74" ry="80" stroke="url(#pg)" strokeWidth="1.5" fill="url(#pgFace)" />
      <ellipse cx="100" cy="92" rx="58" ry="64" stroke="rgba(127,220,255,0.35)" strokeWidth="1" />
      <ellipse cx="100" cy="92" rx="40" ry="44" stroke="rgba(127,220,255,0.22)" strokeWidth="1" />
      <line x1="26" y1="92" x2="174" y2="92" stroke="rgba(127,220,255,0.18)" strokeWidth="1" />
      <line x1="100" y1="12" x2="100" y2="172" stroke="rgba(127,220,255,0.18)" strokeWidth="1" />
      <rect x="92" y="170" width="16" height="58" rx="4" stroke="url(#pg)" strokeWidth="1.5" fill="rgba(34,211,238,0.04)" />
      <line x1="96" y1="180" x2="96" y2="220" stroke="rgba(127,220,255,0.4)" strokeWidth="0.8" />
      <line x1="104" y1="180" x2="104" y2="220" stroke="rgba(127,220,255,0.4)" strokeWidth="0.8" />
      <circle cx="148" cy="58" r="6" stroke="#fde047" strokeWidth="1.2" fill="rgba(253,224,71,0.12)" />
      <circle cx="148" cy="58" r="2" fill="#fde047" />
    </svg>
  );
}
