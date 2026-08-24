import React from "react";

interface BrandMarkProps {
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="brandMarkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
    </defs>
    <polygon points="50,5 92,50 50,95 8,50" fill="url(#brandMarkGradient)" />
    <polygon points="50,5 92,50 50,50" fill="#ffffff" opacity={0.16} />
    <polygon points="8,50 50,50 50,95" fill="#000000" opacity={0.14} />
    <circle cx="76" cy="76" r="18" fill="url(#brandMarkGradient)" stroke="#ffffff" strokeWidth="3" />
    <path
      d="M62,76 L68,76 L71,69 L75,83 L79,65 L83,76 L90,76"
      fill="none"
      stroke="#ffffff"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
