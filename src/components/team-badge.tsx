import Image from "next/image";
import type { Team } from "@/lib/leagues";

export function TeamBadge({ team }: { team: Team }) {
  if (team.logoUrl) {
    // Served straight from storage, to stay clear of the free plan's image optimisation limit.
    return (
      <Image
        src={team.logoUrl}
        alt=""
        width={36}
        height={36}
        unoptimized
        className="h-9 w-9 shrink-0 object-contain"
      />
    );
  }

  const fontSize = team.initials.length >= 4 ? 9.5 : team.initials.length === 3 ? 11.5 : 14;

  return (
    <svg
      viewBox="0 0 36 40"
      className="h-9 w-8 shrink-0"
      aria-hidden="true"
      role="presentation"
    >
      <path
        d="M18 1 L34 6 V20 C34 30 26 36 18 39 C10 36 2 30 2 20 V6 Z"
        fill={team.primary}
        stroke={team.secondary}
        strokeWidth="2"
      />
      <text
        x="18"
        y="24"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={team.secondary}
        fontFamily="var(--font-barlow-condensed)"
      >
        {team.initials}
      </text>
    </svg>
  );
}
