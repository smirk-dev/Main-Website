// his three sites; each place in the forest leads to one of them (2026-10-25: places link out to sites, not archive pages)
const CODE = { url: "https://code.suryanshmishra.com/", name: "the code portfolio" };
const ART = { url: "https://art.suryanshmishra.com/", name: "the art portfolio" };
const BONFIRE = { url: "https://bonfire.suryanshmishra.com/", name: "Bonfire, poems and thoughts" };

// the seven places in the forest, shared by the walk (main.ts) and the scroll tour (tour.ts); x, y on the map, three's z = -y
export const PLACE_LIST = [
  { key: "landing", label: "Landing pages for people", where: "The lanterns", x: -6.5, y: 15, r: 6, site: CODE },
  { key: "earlier", label: "Earlier selves", where: "The wells and mirrors", x: -22, y: 30, r: 7, site: CODE },
  { key: "stories", label: "Poems and thoughts", where: "The ruined chapel", x: -2, y: 80, r: 9, site: BONFIRE },
  { key: "games", label: "Games", where: "The stone ring", x: -30, y: 88, r: 13, site: CODE },
  { key: "work", label: "Work", where: "The milestones", x: 36, y: 85, r: 7, site: CODE },
  { key: "art", label: "Art", where: "The easels", x: -8, y: 100, r: 6, site: ART },
  { key: "tools", label: "Tools and engineering", where: "The anvils", x: 22, y: 96, r: 7, site: CODE },
];
// where each place leads, and what the prompt calls it
export const PAGES: Record<string, string> = Object.fromEntries(PLACE_LIST.map((p) => [p.key, p.site.url]));
export const SITE_NAMES: Record<string, string> = Object.fromEntries(PLACE_LIST.map((p) => [p.key, p.site.name]));

/** Opens a place's site in a new tab, so the forest stays where the visitor left it. */
export function visit(key: string) {
  window.open(PAGES[key], "_blank", "noopener");
}
