import works from "../content/works.json";

// the seven places in the forest, shared by the walk (main.ts) and the scroll tour (tour.ts); x, y on the map, three's z = -y
export const PLACE_LIST = [
  { key: "landing", label: "Landing pages for people", where: "The lanterns", x: -6.5, y: 15, r: 6 },
  { key: "earlier", label: "Earlier selves", where: "The wells and mirrors", x: -22, y: 30, r: 7 },
  { key: "stories", label: "Stories and experiences", where: "The ruined chapel", x: -2, y: 80, r: 9 },
  { key: "games", label: "Games", where: "The stone ring", x: -30, y: 88, r: 13 },
  { key: "work", label: "Work", where: "The milestones", x: 36, y: 85, r: 7 },
  { key: "art", label: "Art and writing", where: "The easels", x: -8, y: 100, r: 6 },
  { key: "tools", label: "Tools and engineering", where: "The anvils", x: 22, y: 96, r: 7 },
];
// a category opens its page only once it has real entries (content/works.json, built by tools/build_archive.mjs)
export const PAGES: Record<string, string> = Object.fromEntries(works.categories.filter((c) => c.entries.length).map((c) => [c.key, `/archive/${c.key}.html`]));
