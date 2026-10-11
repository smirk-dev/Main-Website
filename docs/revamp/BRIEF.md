# suryanshmishra.vercel.app — Revamp Brief (v0.1, 2026-10-11)

> Status: **G0 APPROVED by Suryansh 2026-10-11 → now in G1 (asset gathering)**. All decisions D1-D8 made. Nothing gets built until Suryansh approves this brief.
> Source: Suryansh's spoken brief, 2026-10-11, structured below. Section 9 has the same brief
> as an agent prompt.

---

## 1. North star

A person is the sum of their interests. This site puts all of Suryansh's interests in one
space and gives visitors several paths through it, so each visitor discovers him on their own
journey. That is the closest software gets to meeting someone in real life.

It is a **personal brand**, not a CV. It replaces the current Main-Website (about 2.5 years
old, a single `index.html` with 3 project cards), which no longer represents him as a
developer or as a person.

**What success looks like:** a first-time visitor on an ordinary desktop
1. understands the story told through the three statues,
2. chooses to step through the door,
3. walks the forest and finds at least one structure without being told where it is, and
4. leaves having seen real, live work, with no empty or "coming soon" sections.

---

## 2. The experience: four acts in one loop

### Act I: The Statues (the story)
- The backdrop is **pitch / obsidian black**. The only light is lighting that sculpts each
  statue.
- There are **three figures, shown one at a time** and never all together:
  1. **An Angel**
  2. **An Angel of Death**
  3. **A Motherly figure**
- **Scroll drives the camera around and across each body.** Scrolling down does not always
  move the camera down: it can orbit, rise, push in to a face or hand, or pull back. Every
  scroll step has a purpose and pairs with a line of story text.
- Story copy will come from Suryansh. **Use Lorem Ipsum until then**, with each block tagged
  by statue and beat so the real copy can be dropped in.
- Moving between statues is a deliberate beat (fade through black, or a light sweep), not a
  cut.

### Act II: The Door (the footer)
- The footer is an **interactive 3D door**. The visitor chooses **Enter** or **Leave**.
- **Leave** closes the tab. *Technical constraint:* browsers only let `window.close()` close
  a tab that a script opened. For a normal visit the call is ignored. The plan is to try
  `window.close()`, and if the tab is still open after about 300 ms, fade to black with a
  single line (e.g. "You may close this tab."). → **Decision D3.**
- **Enter** opens the door and the camera passes through into Act III.

### Act III: The Forest (the exploration)
- **Hyper-realistic, not stylised, not semi-real.** The bar is a photograph, not a game
  from 2015.
- **One sun** (the "central star") is the single key light, with a physically based sky,
  shadows cast by every leaf and branch, and light through the canopy.
- **Several tree species and variants.** No single asset stamped at every coordinate. Each
  instance varies in scale, rotation and hue, and the ground cover (ferns, grass, rocks,
  roots, leaf litter) is dense.
- **Scrolling moves the visitor forward** along a path. The path branches, and the branches
  are not obviously visible ("up to interpretation"). At a fork the visitor picks a branch
  by looking or pointing toward it.
- Along the paths the visitor **gradually encounters entities, objects or structures**. Each
  one is the key to one content category (§4). Clicking it leads to Act IV.
- The forest loops: every path returns to the clearing or leads to another structure, so
  there is no dead end.

### Act IV: The Archive pages (the content)
- Clicking a structure transitions (no hard page flash) to that **category's page**: every
  piece in the category, with a preview for each.
- **Preview = image, or an interactive preview on demand.** It is not a video. Games and
  experiences can offer a live embed that loads only when the visitor clicks "Play here".
- Every entry shows its name, a one-line description, its role (built for whom), year,
  stack, live link and status badge: **Live**, **Archived** (domain down, so the entry shows
  a screenshot) or **Reference** (a job or company).
- "Back to the forest" returns the visitor to the structure they came from.

---

### Statue decision (G1, 2026-10-11)
Suryansh approved **all 16 candidates** in `g1-assets/statues.html`.
- **Act I heroes** (one per figure, still swappable after the renders): Angel = *Engel*,
  Eisenstadt Calvary scan (`f48198cd`); Angel of Death = mourning angel, Cimitero Monumentale
  Milan (`c1685650`); Mother = *Maternal Affection*, E.H. Baily 1841, Fitzwilliam (`fcbd7acf`).
- **The other 13 go into the forest** as weathered, moss-touched statues the visitor
  stumbles on. Some of them mark the category structures (§5).
- He kept the caveated three knowingly: the Apel bronze and *Under Fire of War* (modern
  sculptures, so the sculptor's copyright may still apply) and the sculpted Grim Reaper (not
  a scan).
- Every statue gets a CC-BY credit on the credits page.

### Hero renders approved (G1, 2026-10-11)
Suryansh approved `g1-assets/heroes.html` ("approved"): Engel, the Milan mourning angel and
Maternal Affection, lit with a warm key, a cool rim and no fill, on pure black. That lighting is
the Act I look. **The Milan angel keeps her original granite backing wall.** Suryansh
decided this explicitly after I had cut it; I restored it. Do not remove it.
**Constraint:** the Milan scan is front-only (hollow behind the wall), so the Act I camera stays
within about ±60° of her front. Engel and Maternal Affection are full scans and can be orbited.

### Forest and door decision (G1, 2026-10-11)
Suryansh approved `g1-assets/forest.html` ("use this"). This means the **recommended (gold)
set**. All Poly Haven CC0: trees fir_tree_01, pine_tree_01, tree_small_02; saplings
fir_sapling_medium, pine_sapling_medium, fir_sapling, pine_sapling_small; ground cover
fern_02, grass_medium_01, moss_01; deadwood dead_tree_trunk, dead_tree_trunk_02,
tree_stump_01/02, pine_roots, root_cluster_01, dry_branches_medium_01; rocks
rock_moss_set_01/02, boulder_01; door large_castle_door; textures forest_ground_04,
forest_leaves_04, brown_mud_leaves_01; sky kloppenheim_06_puresky. Mixed forest
(oak/beech) is still an open question.

## 3. Realism and rendering: how "hyper-realistic + ray tracing" is achieved in a browser

The blunt fact: **real-time path tracing of a dense forest is not possible in a browser on an
ordinary desktop.** Rendering "every leaf shadow, ray traced" at 60 fps would exclude most
visitors. So the plan is a hybrid, where each technique is used where it actually works:

| Where | Technique | Why |
|---|---|---|
| Statues (Act I) | **Progressive path tracing** (e.g. `three-gpu-pathtracer`) refines the frame whenever scroll rests, and a high-quality rasteriser takes over while moving | Statues are single static objects on black, which is the ideal case for real ray tracing. The settled frame is truly path traced. |
| Forest lighting | **Baked global illumination** (lightmaps / light probes baked offline in Blender Cycles, which is real ray tracing done ahead of time) + real-time sun | Gives ray-traced bounce light and soft occlusion at real-time cost |
| Leaf and branch shadows | Cascaded shadow maps with alpha-tested foliage + soft shadows (PCSS) + contact shadows | Shadows from every leaf, in real time |
| Atmosphere | Physical sky, volumetric light shafts, height fog, AgX / ACES tone mapping, filmic grade | Most of what reads as "real" is light and air, not polygons |
| Screen-space | GTAO (ambient occlusion), SSR where wet or stone, TAA | Cheap, large realism gain |
| Trees at distance | LODs → impostors (pre-rendered billboards) | The only way a dense forest holds frame rate |

**Renderer:** Three.js on **WebGPU** (`WebGPURenderer` + TSL), falling back to WebGL2. Blender
(already wired to Claude over MCP on this machine) is the offline tool for baking, LODs,
impostors, decimation and asset preview renders.

**Quality tiers** are chosen automatically from a short GPU benchmark on load: *Cinematic /
High / Balanced*. They change shadow cascades, foliage density, path-tracing samples and
post-processing.

### Performance budget (proposed; Decision D4)
- **Target:** 60 fps at 1080p on a mid-range desktop GPU (RTX 3060 class). **Floor:** 30 fps
  on integrated graphics in the Balanced tier.
- **First meaningful paint < 3 s.** The first statue is interactive after **≤ 15 MB**
  downloaded. Everything else streams in behind the story.
- **Total streamed assets:** aim for ≤ 150 MB across the whole experience. Textures as
  KTX2/Basis, meshes with Meshopt/Draco, and the forest loads by zone.
- **Mobile:** desktop only. Mobile and tablet visitors get a styled "best experienced on desktop" screen and a link to the plain archive index (D2).

---

## 4. Content model: what goes behind each structure

**Rules**
- **Only real things.** Every entry has a live URL, a working archived screenshot, or is a
  job reference. **No empty categories, no "coming soon" and no dummy cards.** If a category
  would be empty, its structure is not placed in the forest.
- Local-only projects (on disk, never deployed) are **left out for now**. When one is
  deployed it becomes a new entry in one data file, with no code change.
- Content lives in **one typed data file** (`content/works.ts` or `.json`) that drives both
  the forest (which structures exist) and the archive pages.
- Previews are **auto-captured** (Playwright screenshots of each live URL at 1600×1000)
  and then hand-picked.

### Proposed categories and entries (built from the Vercel inventory of 2026-10-11)
*Suryansh to confirm the category of every row (Decision D5).*

**Work (jobs and companies)**: shown as reference links only
| Entry | Link | Status |
|---|---|---|
| Alethman: India-first news intelligence | alethman.com | Live (current) |
| Advuman: Software Engineer + landing page | advuman-landing-page.vercel.app | Live |
| InboxKit: email infrastructure SaaS | inboxkit.com | Reference |

**Games**
| Entry | Link |
|---|---|
| Royal Chess (Stockfish) | royalchessgame.vercel.app |
| Backrooms: horror walking-sim | backroomss.vercel.app |
| VoxelCraft: voxel sandbox | voxelcraft-pi.vercel.app |
| Tilewar: real-time tile-claiming (InboxKit take-home) | inboxkit-assignment-web.vercel.app |
| Code Warrior: GitHub-as-RPG | code-warrior-liart.vercel.app |
| *(more games coming from Suryansh; they slot in here)* | |

**Landing pages built for people and businesses**
| Entry | Link | Status |
|---|---|---|
| Dreamweave: staffing company | dreamweave.in | Live |
| Celestia: creative / branding agency | celestia-opal / celestia-site-umber.vercel.app; celestia.studio is down | Archived domain, Vercel copy live |
| Advuman: landing page | advuman-landing-page.vercel.app | Live |
| HIVE: Dr. Pooja Sarin, academic portfolio | hive-pooja-sarin.vercel.app | Live |
| CommunityConnect: SaaS sample | freelancingakshatvaidsaas.vercel.app | Live |
| Mahakal Yatra: Ujjain pilgrimage planner | ujjaintrip.vercel.app | Live |

**Stories and experiences** (websites with code and storylines)
| Entry | Link |
|---|---|
| ASHFALL: WebGL scrollytelling | ashfall-iota.vercel.app |
| AI History Concept Map: 3D knowledge graph | aihistoryconceptmap.vercel.app |
| Global Broadcasting System: 3D Earth broadcast | broadcastglobal.vercel.app |

**Art and writing**
| Entry | Link |
|---|---|
| smirkarts: personal art studio | smirkarts.vercel.app |
| Bonfire: poetry and thoughts blog | bonfireblog.vercel.app |
| Sine & Sketch: mathematical art studio | sine-and-sketch.vercel.app |

**Tools and engineering**
| Entry | Link |
|---|---|
| Universal 3D Studio: browser 3D editor | 3d-renderer-nu.vercel.app |
| Rubik's Cube Solver | cube-solver-olive.vercel.app |
| img2css: image to pure CSS terminal | img2css-nu.vercel.app |
| DSA Solvebook: automated LeetCode proof of work | dsa-solvebook.vercel.app |
| Nebula: stock dashboard | nebulastock.vercel.app |
| Family Hierarchy: multi-tree family visualiser (view-only to the public) | ancestricheritage.vercel.app |
| Kaggle README Badges: SVG service | kaggle-readme-badges.vercel.app (root 404, so link to a badge path) |

**Earlier selves** (optional: past portfolios as an easter egg)
| Entry | Link |
|---|---|
| The original Main-Website (this site, 2023) | archived screenshot |
| Coding portfolio (Chrome-style) | suryanshcodes.vercel.app |

**Proposed exclusions (confirm, D5)**
- `github-readme-stats`, `github-readme-activity-graph`, `github-profile-trophy`: these look
  like self-hosted deployments of open-source projects, not his own work.
- ~~`heritage`~~ moved to Tools: **Family Hierarchy** (ancestricheritage.vercel.app). Viewing is public, but editing has been password-gated since 2026-10-11 (heritage commit `1d06604`).
- UseMyBio: excluded by Suryansh.

---

## 5. Structures (the forest's "keys"): one per category

Each structure is a found object, not a sign. Placeholder concepts below; the final pick
happens at the asset gate.

| Category | Structure concept (proposal) |
|---|---|
| Work | A stone waystation / milestone pillar with inscriptions |
| Games | A ring of standing stones / an old game board carved in a stump |
| Landing pages for people | A cluster of hanging lanterns (one per person) |
| Stories and experiences | A ruined archway with light through it |
| Art and writing | An abandoned easel / a writing desk under a tree |
| Tools and engineering | An old forge / an orrery |
| Earlier selves | A small mirror or a reflecting pool (hidden, off the main path) |

---

## 6. Technical architecture (proposed)

- **Stack:** Vite + TypeScript + Three.js (WebGPU / TSL) + Lenis (scroll) + GSAP
  (timelines). The archive pages are plain HTML/CSS in the same app, so they need no
  framework. Reuse `3dportfolio`'s chapter-driven camera-path system and asset pipeline.
- **Where it lives:** the `smirk-dev/Main-Website` repo on a `revamp` branch, so the
  existing Vercel project `suryanshmishra` keeps its URL. The old site stays in git history
  and as an "Earlier selves" entry (D1).
- **Asset hosting:** large binaries go **outside git** (Cloudflare R2 / Vercel Blob / GitHub
  Releases). The `3dportfolio` repo already carries a 196 MB zip in its history; don't
  repeat that.
- **Asset pipeline:** source → Blender (clean up, decimate, UV, bake GI, LODs, impostors) →
  `gltf-transform` (meshopt + KTX2) → CDN. Every asset gets a budget row: triangles, texture
  MB, draw calls.
- **Accessibility floor:** a "skip the experience" link to a plain archive index,
  `prefers-reduced-motion` respected, all story text real DOM text (not baked into images),
  and keyboard navigation for the door and the structures.

---

## 7. Process: gates and the review loop

Each gate needs **Suryansh's explicit approval** before the next begins.

| Gate | Deliverable | Who approves |
|---|---|---|
| **G0 Plan** | This brief, with decisions D1-D6 answered | Suryansh |
| **G1 Assets** | For every asset: 2-4 candidates, each with a preview render, source, **license**, triangle count and texture size. Shown one category at a time (statues → door → trees → ground cover → structures → sky/HDRI) | Suryansh, **each asset individually** |
| **G2 Scenes (individually)** | Each built and shown on its own: (a) each statue's lighting and scroll choreography, (b) the door, (c) the forest environment with sun, shadows and GI, (d) each structure placed in its clearing, (e) one archive page | Suryansh, scene by scene |
| **G3 Assembly** | All scenes joined into the full loop, with performance measured on the tiers | Suryansh |
| **G4 External review** | A **zero-context reviewer** (fresh agent with no brief, plus Suryansh) rates the site against the rubric below | Both |
| **G5 Iterate** | Fix → re-review until the rubric is met | Suryansh |

**Loop engineering (during G2-G3):** maker/checker split. The building agent does not grade
its own work. A separate checker agent compares each scene against this brief and the
rubric, using screenshots and measured fps, and the maker fixes what it finds before
anything reaches Suryansh.

**Review rubric (scored 1-10, each with a pass bar)**
1. **Realism:** does a still frame read as photographed? (pass ≥ 8)
2. **Story:** can a cold viewer retell the statue sequence? (≥ 7)
3. **Discovery:** does the reviewer find ≥ 3 structures unaided within 3 minutes? (yes/no)
4. **Content truth:** every link works, every status badge is correct, no empty sections (100%)
5. **Performance:** measured fps per tier meets §3 targets; first statue ≤ 15 MB (yes/no)
6. **Craft:** transitions, type, sound (if any), no jank (≥ 8)

---

## 8. Open decisions for Suryansh

| # | Decision | Recommendation |
|---|---|---|
| D1 | Where to build | ✅ **DECIDED 2026-10-11: Main-Website, `revamp` branch** |
| D2 | Mobile | ✅ **DECIDED: desktop-only screen**: a styled "best experienced on desktop" page + a link to the plain archive index |
| D3 | Leave behaviour | ✅ **DECIDED: try `window.close()` → fade to black with "You may close this tab."** |
| D4 | Performance floor | ✅ **DECIDED: must work on all desktop systems**, including integrated GPUs, via automatic tiers |
| D5 | Categories | ✅ **DECIDED:** heritage included (editing now password-gated, see below). UseMyBio excluded. InboxKit = inboxkit.com. README-stat forks excluded. |
| D6 | Sound | ✅ **DECIDED: forest ambience** (off until the visitor opts in, as browsers require a click before audio). No statue score. |
| D7 | Asset budget | ✅ **DECIDED: free only** (CC0 / CC-BY: Poly Haven, Sketchfab scans, Smithsonian 3D, museum scans). CC-BY credits go on a credits page. |
| D8 | Rendering approach | ✅ **DECIDED: hybrid** (path-traced statues at rest, baked GI + real-time forest) |

---

## 9. The brief as an agent prompt

```
You are building the new suryanshmishra.vercel.app, Suryansh Mishra's personal-brand site.
It replaces a 2.5-year-old single-page portfolio that no longer represents him.

INTENT
A person is the sum of their interests. Put all of Suryansh's interests in one space with
several paths through it, so each visitor discovers him on their own journey: the closest
software gets to meeting him in person.

EXPERIENCE (one continuous loop, four acts)
I. Statues. Obsidian-black void. Three hyper-realistic statues shown ONE AT A TIME: an
   Angel, an Angel of Death, a Motherly figure. Scroll drives the camera around and across
   each body (orbit, rise, push in; not simply downwards). Each scroll step pairs with a
   story line. Use Lorem Ipsum tagged by statue and beat until the real copy arrives.
II. Door. At the footer, an interactive 3D door: Enter or Leave. Leave tries
   window.close(), then falls back to fade-to-black with "You may close this tab."
   Enter opens the door and the camera passes through.
III. Forest. Hyper-realistic: one sun as the key light, physical sky, shadows from every
   leaf and branch, light shafts, several tree species and variants (never one asset
   repeated), dense ground cover. Scroll moves the visitor forward along branching,
   non-obvious paths. Along them stand structures; each is the key to one content
   category. Paths loop, so there are no dead ends.
IV. Archive. Clicking a structure transitions to that category's page: every entry with an
   image preview (or a live embed that loads only on click), name, one-liner, role, year,
   stack, link, and a status badge (Live / Archived / Reference). A back link returns to
   the forest at that structure.

CONTENT RULES
Only real entries: live URL, archived screenshot, or job reference. No empty or "coming
soon" sections; a category with no entries has no structure. One typed data file drives
both the forest and the archive pages. Categories and entries: see BRIEF.md §4.

RENDERING
Three.js WebGPURenderer (TSL) with a WebGL2 fallback. Statues: progressive path tracing
when scroll rests, high-quality raster while moving. Mobile/tablet: desktop-only screen + plain archive link. Assets: free (CC0/CC-BY) only, credited. Forest: GI baked in Blender Cycles +
real-time sun, cascaded and soft shadows with alpha-tested foliage, GTAO, volumetrics,
AgX tone mapping, LOD → impostors. Automatic quality tiers (Cinematic / High / Balanced).

BUDGETS
60 fps at 1080p on an RTX 3060-class GPU; 30 fps floor in Balanced on integrated graphics.
First statue interactive after ≤ 15 MB. Total streamed ≤ 150 MB. KTX2 + Meshopt. Large
binaries never go in git.

PROCESS (hard gates; never skip one)
G0 plan approved → G1 every asset approved individually by Suryansh (candidates with a
render, source, licence, triangle count, texture size) → G2 every scene approved
individually → G3 assembly → G4 zero-context external review + Suryansh, scored against
the rubric in BRIEF.md §7 → G5 iterate. During G2-G3 a separate checker agent reviews
each scene before Suryansh sees it; the maker never grades its own work.
```
