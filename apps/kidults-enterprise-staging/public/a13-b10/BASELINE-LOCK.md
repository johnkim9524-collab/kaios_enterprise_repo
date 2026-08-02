# A13-B10 Baseline Lock

Status: staging design baseline

## Locked visual decisions

- Hero copy: `Objects become / CULTURE / before consensus.`
- Desktop header: left-aligned KIDULTS brand with right-aligned navigation and access action.
- Mobile header: KIDULTS brand and Enterprise Access only.
- Display type: Cormorant Garamond.
- Premium numbers: Bodoni Moda.
- Interface and data UI: Inter.
- Palette: ivory, paper, ink, muted gold, restrained forest and risk red.
- Kidult 100 score ring: 12 o'clock start, clockwise progress, square line caps.
- Individual digit DOM splitting and per-digit transforms are prohibited.

## Locked responsive decisions

- Supported review widths: 320, 360, 390, 768, 1024, 1280, 1536 and 1920.
- No horizontal page scrolling.
- Mobile hero uses explicit line elements rather than browser-dependent word wrapping.
- Mobile sections use one-column editorial flow.
- Hero proof items stack vertically on mobile.
- Hero metrics use a 2 by 2 mobile grid.
- Benchmark controls use a mobile-safe grid.
- Signal Queue uses a dedicated mobile row layout.
- Watchlist, Evidence and Research use single-column mobile cards.

## Release gates

- Production remains untouched until PR review and CI pass.
- Staging values remain illustrative until API contracts are connected.
- The portal must visibly disclose `STAGING · ILLUSTRATIVE DATA` before merge.
- Final architecture target: one HTML, one CSS and one JS file under `/a13-b10/`.
