import React from "react";

interface SteamKitMarkProps {
  size?: number;
  className?: string;
}

export default function SteamKitMark({ size = 24, className = "" }: SteamKitMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 6v12M8 12l7-6M8 12l7 6" />
    </svg>
  );
}