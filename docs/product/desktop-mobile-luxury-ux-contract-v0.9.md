# Desktop and Mobile Luxury UX Contract v0.9

## Objective

Ensure that every Kidults and Artfund customer-facing portal ships as a complete premium experience on desktop, iPhone, and Android at the same time.

## Supported Viewports

- 320px minimum supported width.
- 375px and 390px mobile reference widths.
- 768px tablet reference width.
- 1024px compact desktop.
- 1440px primary desktop reference.
- 1920px wide desktop validation.

## Global Rules

1. `overflow-x` is prohibited at page level.
2. All interactive targets are at least 44 x 44px.
3. Navigation, search, chips, filters, charts, tables, cards, and drawers must have explicit mobile behavior.
4. Hover-only interaction is prohibited.
5. Critical interpretation remains visible without opening a tooltip.
6. Focus order follows visual and semantic hierarchy.

## Desktop Experience

### Layout

- Maximum content width should preserve editorial authority and prevent dashboard sprawl.
- Use a 12-column grid where analytical comparison benefits from it.
- Use asymmetry only to create hierarchy, not decoration.
- Primary intelligence must remain above supporting metadata.

### Data Density

- Enterprise and institutional views may use higher density than personal portals.
- Dense tables must retain readable row rhythm and clear grouping.
- Side panels may be used for methodology, evidence, filters, or saved views.

## Mobile Experience

### Navigation

- One primary menu control.
- Role and vertical remain identifiable.
- Search and alerts remain reachable within one interaction.

### Cards

- One-column default.
- Primary value, interpretation, confidence, and freshness appear before secondary metadata.
- Secondary evidence may expand in a drawer.

### Charts

- Simplify labels before shrinking typography below readable size.
- Support touch selection and accessible text summaries.
- Do not depend on hover.
- Use short-period views as default with explicit range controls.

### Tables

Choose one of:

- responsive card transformation
- column priority reduction
- contained horizontal detail region

Page-level horizontal scrolling is prohibited.

### Filters and Chips

- Provide wrap or controlled horizontal chip region.
- Selected state must be visually and programmatically explicit.
- Clear-all action is mandatory for complex filter sets.

## Kidults Mobile Priority

1. Kidult 100 status.
2. Watchlist changes.
3. Brand and category momentum.
4. Alerts.
5. Collection value and liquidity.

## Artfund Mobile Priority

1. Global Art Market Index status.
2. Artist and auction signals.
3. Upcoming auction events.
4. Provenance and confidence warnings.
5. Portfolio and watchlist review.

## Performance Budgets

- Initial customer portal route should target <= 2.5 seconds on a mid-tier mobile connection.
- Interaction response target <= 100ms where no network round trip is required.
- Layout shift must remain minimal.
- Images must use responsive sizing and lazy loading where appropriate.

## Acceptance Test Matrix

Each released page must pass:

- 320 x 568
- 375 x 812
- 390 x 844
- 768 x 1024
- 1024 x 768
- 1440 x 900

Tests include:

- no horizontal overflow
- keyboard navigation
- touch target size
- loading state
- empty state
- partial-data state
- error state
- unauthorized state
- long text and localization expansion
- reduced motion
- slow network

## Release Rule

A desktop-only implementation is incomplete. A mobile patch after release is not accepted as completion under the Dual Global Standard program.
