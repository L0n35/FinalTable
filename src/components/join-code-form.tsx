"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned) router.push(`/join/${encodeURIComponent(cleaned)}`);
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        aria-label="Join code"
        value={code}
        maxLength={8}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Join code"
        onChange={(event) => setCode(event.target.value)}
        className="h-13 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-semibold tracking-widest uppercase placeholder:font-normal placeholder:tracking-normal placeholder:text-muted/70 placeholder:normal-case focus-visible:outline-2 focus-visible:outline-accent"
      />
      <button type="submit" className="h-13 shrink-0 rounded-lg border border-line px-5 font-semibold">
        Join
      </button>
    </form>
  );
}
