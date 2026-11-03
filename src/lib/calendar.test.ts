import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar";

const base = {
  uid: "season-1-deadline@final-table",
  title: "Dave's Mates",
  deadline: "2026-08-14T18:00:00.000Z",
  url: "https://example.test/leagues/daves-mates",
  now: new Date("2026-08-01T00:00:00.000Z"),
};
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  it("ends the event at the deadline, with reminders before it", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTART:20260814T173000Z");
    expect(ics).toContain("DTEND:20260814T180000Z");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("UID:season-1-deadline@final-table");
  });

  it("uses the line endings calendars require", () => {
    const ics = buildIcs(base);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("can't be broken by a league name", () => {
    const ics = unfold(buildIcs({ ...base, title: "A, B; C\\D\r\nEND:VEVENT" }));
    expect(ics).toContain("SUMMARY:Predictions lock: A\\, B\\; C\\\\D\\nEND:VEVENT");
    expect(ics.match(/^END:VEVENT\r?$/gm)).toHaveLength(1);
  });

  it("splits long lines without breaking characters", () => {
    const title = "🏆".repeat(40);
    const ics = buildIcs({ ...base, title });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).not.toContain("�");
    expect(unfold(ics)).toContain(`SUMMARY:Predictions lock: ${title}`);
  });
});

describe("googleCalendarUrl", () => {
  it("links to an event ending at the deadline, with the name encoded", () => {
    const url = new URL(googleCalendarUrl({ title: "A & B", deadline: base.deadline }));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe("Predictions lock: A & B");
    expect(url.searchParams.get("dates")).toBe("20260814T173000Z/20260814T180000Z");
  });
});
