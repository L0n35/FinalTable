import type { Division } from "@/lib/divisions";
import type { Team, Zones } from "@/lib/leagues";

export type League = {
  id: string;
  name: string;
  deadline: string;
  zones: Zones;
  teams: Team[];
  // Conferences, if the league has any. Each team then says which one it's in.
  divisions?: Division[];
};

const teams: Team[] = [
  { id: "alderbrook", name: "Alderbrook Athletic", initials: "AA", primary: "#7a1f2b", secondary: "#f5d76e" },
  { id: "ashford", name: "Ashford Rovers", initials: "AR", primary: "#14508c", secondary: "#ffffff" },
  { id: "bramley", name: "Bramley Town", initials: "BT", primary: "#f2c230", secondary: "#1c1c1c" },
  { id: "castlegate", name: "Castlegate United", initials: "CU", primary: "#b3202a", secondary: "#ffffff" },
  { id: "dunmere", name: "Dunmere City", initials: "DC", primary: "#7cc4ee", secondary: "#10283d" },
  { id: "eastvale", name: "Eastvale Albion", initials: "EA", primary: "#ffffff", secondary: "#1b3f8f" },
  { id: "fenwick", name: "Fenwick Wanderers", initials: "FW", primary: "#e86a17", secondary: "#1c1c1c" },
  { id: "glenhaven", name: "Glenhaven FC", initials: "GF", primary: "#14613a", secondary: "#ffffff" },
  { id: "harrow", name: "Harrow Vale", initials: "HV", primary: "#4b2a7b", secondary: "#f0e6ff" },
  { id: "ironbridge", name: "Ironbridge Athletic", initials: "IA", primary: "#3a3f45", secondary: "#f2c230" },
  { id: "kingsmere", name: "Kingsmere Town", initials: "KT", primary: "#0f7c7c", secondary: "#ffffff" },
  { id: "lakeside", name: "Lakeside Rangers", initials: "LR", primary: "#1d6fd1", secondary: "#ffffff" },
  { id: "marlow", name: "Marlow Heath", initials: "MH", primary: "#d9e4c8", secondary: "#2e4a1f" },
  { id: "northgate", name: "Northgate City", initials: "NC", primary: "#101820", secondary: "#f5f5f5" },
  { id: "oakhurst", name: "Oakhurst United", initials: "OU", primary: "#8a5a2b", secondary: "#fff3df" },
  { id: "pinewood", name: "Pinewood Rovers", initials: "PR", primary: "#2f8f4e", secondary: "#10240f" },
  { id: "queensferry", name: "Queensferry FC", initials: "QF", primary: "#c2185b", secondary: "#ffffff" },
  { id: "redcliffe", name: "Redcliffe Town", initials: "RT", primary: "#e53935", secondary: "#1c1c1c" },
  { id: "stonebridge", name: "Stonebridge Albion", initials: "SA", primary: "#9aa5ad", secondary: "#14202a" },
  { id: "westhaven", name: "Westhaven United", initials: "WU", primary: "#ffd8a8", secondary: "#7a2e00" },
];

// Placeholder data for the ranking prototype, until leagues come from the database.
export const demoLeague: League = {
  id: "demo",
  name: "Demo League 2027",
  deadline: "2027-08-07T14:00:00Z",
  zones: { promotion: 2, playoffFrom: 3, playoffTo: 6, relegation: 3 },
  teams,
};
