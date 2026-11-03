// The calendar event ends at the deadline, so its start and reminders all fall before predictions lock.
const EVENT_MINUTES = 30;
const DETAILS = "Make or change your prediction on Final Table before this time.";

type Deadline = { title: string; deadline: string };

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventTimes(deadline: string) {
  const end = new Date(deadline);
  return { start: new Date(end.getTime() - EVENT_MINUTES * 60_000), end };
}

const eventTitle = (title: string) => `Predictions lock: ${title}`;

// Line breaks and separators in a league name would otherwise change the file's meaning.
function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines over 75 bytes must be split, and a split can't land inside a character.
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 75) {
      parts.push(current);
      current = " ";
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

export function buildIcs({
  uid,
  title,
  deadline,
  url,
  now = new Date(),
}: Deadline & { uid: string; url: string; now?: Date }): string {
  const { start, end } = eventTimes(deadline);
  const reminder = (trigger: string) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(eventTitle(title))}`,
    `TRIGGER:${trigger}`,
    "END:VALARM",
  ];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Final Table//Deadline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(eventTitle(title))}`,
    `DESCRIPTION:${escapeText(DETAILS)}`,
    `URL:${url}`,
    ...reminder("-P1D"),
    ...reminder("-PT1H"),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(foldLine)
    .join("\r\n")
    .concat("\r\n");
}

export function googleCalendarUrl({ title, deadline }: Deadline): string {
  const { start, end } = eventTimes(deadline);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(title),
    dates: `${stamp(start)}/${stamp(end)}`,
    details: DETAILS,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
