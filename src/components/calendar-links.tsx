import { googleCalendarUrl } from "@/lib/calendar";

export function CalendarLinks({
  title,
  deadline,
  icsHref,
}: {
  title: string;
  deadline: string;
  icsHref: string;
}) {
  const linkClass = "flex h-11 items-center justify-center rounded-lg border border-line text-sm font-semibold";
  return (
    <div>
      <p className="mb-1 text-center text-sm text-muted">Add the deadline to your calendar</p>
      <div className="grid grid-cols-2 gap-2">
        <a href={icsHref} className={linkClass}>
          Apple or Outlook
        </a>
        <a href={googleCalendarUrl({ title, deadline })} target="_blank" rel="noreferrer" className={linkClass}>
          Google
        </a>
      </div>
    </div>
  );
}
