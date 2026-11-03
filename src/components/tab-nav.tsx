import Link from "next/link";

export function TabNav({
  label,
  current,
  options,
}: {
  label: string;
  current: string;
  options: { key: string; label: string; href: string }[];
}) {
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-surface p-1">
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          scroll={false}
          aria-current={current === option.key ? "page" : undefined}
          className={`flex h-10 items-center justify-center rounded-md font-semibold ${
            current === option.key ? "bg-surface-raised text-foreground" : "text-muted"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
