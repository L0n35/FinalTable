import type { Team } from "@/lib/demo-league";

export function TeamBadge({ team }: { team: Team }) {
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
        fontSize="14"
        fontWeight="700"
        fill={team.secondary}
        fontFamily="var(--font-barlow-condensed)"
      >
        {team.initials}
      </text>
    </svg>
  );
}
