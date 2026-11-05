"use client";

import { useEffect, useState } from "react";
import { TeamBadge } from "@/components/team-badge";
import { demoLeague } from "@/lib/demo-league";

const ROW_HEIGHT = 46;
const STEP_MS = 2400;

// Fictional teams, so this says nothing about any real league.
const TEAMS = ["bramley", "ashford", "dunmere", "castlegate", "glenhaven"].map(
  (id) => demoLeague.teams.find((team) => team.id === id)!,
);

// The table after each drag, as positions in TEAMS, with the team that was just moved.
const STEPS = [
  { order: [0, 1, 2, 3, 4], moved: null },
  { order: [0, 3, 1, 2, 4], moved: 3 },
  { order: [3, 0, 1, 2, 4], moved: 3 },
  { order: [3, 0, 4, 1, 2], moved: 4 },
  { order: [3, 4, 0, 1, 2], moved: 4 },
  { order: [0, 3, 4, 1, 2], moved: 0 },
  { order: [0, 1, 3, 4, 2], moved: 1 },
  { order: [0, 1, 2, 3, 4], moved: 2 },
];

// Shows the game in one glance: dragging teams up and down a table. Decorative, so hidden from screen
// readers, and it stays still for anyone who has asked for less motion.
export function HeroTable() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setStep((current) => (current + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(timer);
  }, []);

  const { order, moved } = STEPS[step];
  const leader = order[0];

  return (
    <div aria-hidden="true" className="rounded-2xl border-[1.5px] border-chalk bg-surface p-2">
      <div className="flex items-baseline justify-between px-2 pt-1 pb-2">
        <span className="font-display text-xl font-bold">Your prediction</span>
        <span className="text-sm text-muted">Drag to rank</span>
      </div>
      <div className="relative" style={{ height: TEAMS.length * ROW_HEIGHT }}>
        {TEAMS.map((_, position) => (
          <div
            key={position}
            className={`absolute left-0 flex w-7 items-center justify-center border-l-4 font-display text-lg font-bold text-muted ${
              position < 2 ? "border-promotion" : position === TEAMS.length - 1 ? "border-relegation" : "border-transparent"
            }`}
            style={{ top: position * ROW_HEIGHT + 4, height: ROW_HEIGHT - 8 }}
          >
            {position + 1}
          </div>
        ))}
        {TEAMS.map((team, index) => {
          const isMoved = moved === index;
          return (
            <div
              key={team.id}
              className={`absolute inset-x-0 left-8 flex items-center gap-2 rounded-lg px-2 transition-[transform,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                isMoved ? "z-10 bg-surface-raised shadow-lg shadow-black/50 ring-1 ring-accent" : ""
              }`}
              style={{ height: ROW_HEIGHT - 6, top: 3, transform: `translateY(${order.indexOf(index) * ROW_HEIGHT}px)` }}
            >
              <TeamBadge team={team} />
              <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
              <span className="w-10 shrink-0 text-center text-muted">
                {leader === index ? (
                  <span key={step} className="pop inline-block rounded-full bg-accent px-1.5 text-xs font-bold text-accent-ink">
                    +10
                  </span>
                ) : (
                  <span className="text-lg" aria-hidden="true">
                    ≡
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="px-2 pt-2 pb-1 text-sm text-muted">Call first place for a 10-point bonus.</p>
    </div>
  );
}
