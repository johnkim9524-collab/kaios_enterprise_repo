# A13 Calm Intelligence System — Information Hierarchy and Wireframe Specification

## 1. Objective

Translate the global-best benchmark findings into a focused Kidults portal structure that is calm, evidence-led, commercially clear and scalable.

The design must not behave like a long brand presentation. It must behave like an intelligence product that proves value quickly and guides users toward deeper analysis.

## 2. Governing principle

**One screen, one dominant message.**

The experience should follow this sequence:

1. Define the product.
2. Prove that the product is live and evidence-led.
3. Show the proprietary benchmark.
4. Let users explore markets and research.
5. Show trust where claims are made.
6. Offer a clear enterprise path.

## 3. Primary audience

### Primary
- global brand and category executives
- investors and market-intelligence professionals
- collectible-market operators and strategy teams

### Secondary
- serious collectors
- research partners
- media and ecosystem participants

## 4. Product definition

**Kidults is the intelligence layer for global collectible markets.**

It helps users distinguish durable market momentum from noise by combining category movement, liquidity, brand strength and evidence confidence.

## 5. Navigation architecture

### Primary navigation
- Overview
- Markets
- Kidult 100
- Research
- Enterprise

### Utility navigation
- Search
- Trust
- Sign in

### Navigation rules
- maximum five primary items
- no duplicate concept between primary and utility navigation
- no oversized header
- active state must be clear but quiet
- mobile uses one-row horizontal scroll rail before any hamburger fallback

## 6. Homepage information hierarchy

### 6.1 Compact header
Purpose: orient without competing with the product.

Content:
- Kidults wordmark
- five primary navigation items
- Search / Trust / Sign in

### 6.2 Product-definition hero
Purpose: answer what Kidults is within five seconds.

Recommended copy:

**The intelligence layer for global collectible markets.**

Track category momentum, liquidity, brand strength and evidence confidence across the global collectibles economy.

Primary CTA: Explore Kidult 100
Secondary CTA: View market intelligence

Hero constraints:
- one headline only
- no split-screen promotional panel
- no giant decorative serif block
- maximum two CTAs
- visible product proof beneath the copy

### 6.3 Compact proof strip
Purpose: establish trust immediately without a full trust section.

Fields:
- data freshness
- evidence confidence
- methodology version
- current operating status

### 6.4 Market Pulse
Purpose: show what is changing now.

Desktop:
- one lead signal
- three supporting category cards
- one compact trend chart or directional indicator

Mobile:
- one lead signal
- horizontal card rail

Required fields per signal:
- category
- direction
- confidence
- freshness
- evidence count

### 6.5 Kidult 100 preview
Purpose: make the proprietary benchmark the strongest product proof.

Desktop:
- compact table with 5–7 rows
- rank, category, score, 30-day momentum, confidence
- one explanatory note

Mobile:
- ranked cards
- no horizontal table overflow

Primary CTA: View full Kidult 100

### 6.6 Explore Markets
Purpose: move from homepage narrative into product exploration.

Recommended category tiles:
- Character Goods
- Construction / Hobby
- Trading Cards
- Designer Toys
- Sports Collectibles
- Pop Culture Memorabilia

Each tile should show:
- latest signal
- liquidity grade
- confidence
- latest update

### 6.7 Research Highlights
Purpose: show that evidence compounds over time.

Homepage should show only 3 featured research items.

Each item:
- title
- report type
- publication date
- short thesis
- evidence status

The full archive belongs on the Research page, not the homepage.

### 6.8 Embedded trust band
Purpose: place trust beside claims rather than in a detached promotional section.

Content:
- methodology summary
- source coverage
- update cadence
- quality status
- links to Methodology and Status

### 6.9 Enterprise outcome section
Purpose: explain business outcomes before asking for contact.

Three outcomes:
- benchmark opportunities
- inspect evidence behind signals
- build decision workflows

Primary CTA: Request Enterprise Access

The full form belongs on the Enterprise page. Homepage uses only CTA and concise proof.

### 6.10 Compact footer
- product navigation
- company / legal
- methodology / status
- contact

## 7. Page architecture

### Overview
- product definition
- market pulse
- Kidult 100 preview
- market exploration
- research highlights
- embedded trust
- enterprise outcome

### Markets
- category navigation
- market overview
- category comparison
- signal history
- liquidity and evidence panels

### Kidult 100
- ranking table
- filters
- methodology summary
- score decomposition
- change history

### Research
- featured report
- search and filters
- archive list
- report detail pages

### Enterprise
- audience outcomes
- workflow examples
- evidence access levels
- request form

### Trust utility
- Methodology
- Status
- Data coverage
- Release integrity

## 8. Desktop wireframe

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Kidults   Overview Markets Kidult 100 Research Enterprise   S T SI │
├─────────────────────────────────────────────────────────────────────┤
│ THE INTELLIGENCE LAYER FOR GLOBAL COLLECTIBLE MARKETS              │
│ Product explanation                                  [Primary CTA] │
│                                                     [Secondary CTA] │
├─────────────────────────────────────────────────────────────────────┤
│ Freshness │ Confidence │ Methodology │ Status                       │
├─────────────────────────────────────────────────────────────────────┤
│ MARKET PULSE                                                        │
│ Lead signal                         Supporting signals               │
│ [primary data visualization]        [card] [card] [card]            │
├─────────────────────────────────────────────────────────────────────┤
│ KIDULT 100                                             View full →   │
│ Rank │ Category │ Score │ Momentum │ Confidence                     │
│ 1    │ ...      │ ...   │ ...      │ ...                            │
├─────────────────────────────────────────────────────────────────────┤
│ EXPLORE MARKETS                                                     │
│ [tile] [tile] [tile]                                                │
│ [tile] [tile] [tile]                                                │
├─────────────────────────────────────────────────────────────────────┤
│ RESEARCH HIGHLIGHTS                                                 │
│ [report]                    [report]                    [report]      │
├─────────────────────────────────────────────────────────────────────┤
│ TRUST: methodology · coverage · cadence · status                    │
├─────────────────────────────────────────────────────────────────────┤
│ ENTERPRISE OUTCOMES                              Request access →    │
└─────────────────────────────────────────────────────────────────────┘
```

## 9. Mobile wireframe

```text
┌──────────────────────────────┐
│ Kidults                 S SI │
│ Overview Markets K100 ... →  │
├──────────────────────────────┤
│ THE INTELLIGENCE LAYER       │
│ FOR GLOBAL COLLECTIBLE       │
│ MARKETS                      │
│ Product explanation          │
│ [Explore Kidult 100]         │
│ [View intelligence]          │
├──────────────────────────────┤
│ Fresh  Confidence  Status →  │
├──────────────────────────────┤
│ MARKET PULSE                 │
│ [Lead signal]                │
│ [horizontal signal rail →]   │
├──────────────────────────────┤
│ KIDULT 100                   │
│ [rank card]                  │
│ [rank card]                  │
│ [rank card]                  │
├──────────────────────────────┤
│ EXPLORE MARKETS              │
│ [2-column compact tiles]     │
├──────────────────────────────┤
│ RESEARCH                     │
│ [featured report]            │
│ [report]                     │
├──────────────────────────────┤
│ TRUST SUMMARY                │
├──────────────────────────────┤
│ ENTERPRISE OUTCOME           │
│ [Request access]             │
└──────────────────────────────┘
```

## 10. Visual hierarchy rules

- one display-size headline per page
- serif reserved for editorial emphasis, not operational labels
- sans-serif for navigation, controls, tables and product copy
- mono reserved for scores, metadata, timestamps and methodology versions
- one semantic accent color
- dark surfaces limited to high-value proof or enterprise moments
- no full-height decorative panels
- no more than three card styles
- no section should exceed its information value through empty vertical space

## 11. Interaction rules

- all data cards link to a deeper market or evidence view
- trust metadata remains visible at the point of decision
- hover is supplementary; all functions work by keyboard and touch
- tables transform into cards on small screens
- search is global and persistent
- no competing conversion forms on the homepage

## 12. Acceptance criteria

- product purpose understandable within five seconds
- primary CTA visible without scrolling
- Kidult 100 visible within the first two major scroll segments
- no more than one dominant visual block per viewport
- desktop and mobile preserve the same information priority
- trust information is embedded beside data claims
- homepage contains no full enterprise form
- homepage research is limited to three items
- navigation has five primary items maximum

## 13. Decision recommendation

Proceed with the Calm Intelligence System only after this information hierarchy is approved.

The next build should replace the current A13 homepage composition rather than add another styling layer on top of it.
