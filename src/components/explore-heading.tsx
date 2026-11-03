import { TabNav } from "@/components/tab-nav";

export function ExploreHeading({ current }: { current: "leagues" | "groups" }) {
  return (
    <>
      <div>
        <h1 className="font-display text-6xl leading-none font-bold tracking-tight uppercase">Explore</h1>
        <p className="mt-1 text-lg text-muted">Pick a league. Call the table. See who was right.</p>
      </div>
      <TabNav
        label="Leagues and groups"
        current={current}
        options={[
          { key: "leagues", label: "Leagues", href: "/explore" },
          { key: "groups", label: "Groups", href: "/explore/groups" },
        ]}
      />
    </>
  );
}
