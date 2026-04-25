export default function FruitProp() {
  return (
    <svg className="fruit-svg" viewBox="0 0 220 220" fill="none">
      <defs>
        <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbb6ce" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <radialGradient id="fgFace" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0" stopColor="rgba(244,114,182,0.18)" />
          <stop offset="1" stopColor="rgba(244,114,182,0)" />
        </radialGradient>
      </defs>
      <g transform="translate(110 110)">
        <g transform="rotate(-18) translate(-26 -8)">
          <path
            d="M -56 0 A 56 56 0 0 1 56 0 L 50 8 L -50 8 Z"
            stroke="url(#fg)"
            strokeWidth="1.5"
            fill="url(#fgFace)"
          />
          <circle cx="0" cy="-8" r="42" stroke="rgba(251,182,206,0.3)" strokeWidth="1" fill="none" />
          <circle cx="0" cy="-8" r="26" stroke="rgba(251,182,206,0.18)" strokeWidth="1" fill="none" />
          <line x1="-44" y1="0" x2="44" y2="0" stroke="rgba(251,182,206,0.45)" strokeWidth="1" />
          <ellipse cx="-18" cy="-18" rx="2.5" ry="4" fill="#fde047" opacity="0.85" />
          <ellipse cx="0" cy="-26" rx="2.5" ry="4" fill="#fde047" opacity="0.85" />
          <ellipse cx="18" cy="-18" rx="2.5" ry="4" fill="#fde047" opacity="0.85" />
        </g>
        <path
          d="M -100 -70 Q 0 -10 100 70"
          stroke="rgba(253,224,71,0.55)"
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="2 5"
        />
        <path
          d="M -100 -70 Q 0 -10 100 70"
          stroke="rgba(253,224,71,0.18)"
          strokeWidth="6"
          fill="none"
        />
      </g>
      <circle cx="40" cy="48" r="3" stroke="#7fdcff" strokeWidth="1" fill="rgba(127,220,255,0.2)" />
      <circle cx="186" cy="170" r="2.5" stroke="#7fdcff" strokeWidth="1" fill="rgba(127,220,255,0.2)" />
    </svg>
  );
}
