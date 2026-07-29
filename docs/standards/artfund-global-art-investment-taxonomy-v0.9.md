# Artfund Global Art Investment Taxonomy v0.9

## Objective

Define the canonical market language required for Artfund to become the global standard for art investment intelligence.

## Canonical Hierarchy

1. Market
2. Region
3. Segment
4. Artist
5. Artwork
6. Edition
7. Provenance Event
8. Exhibition
9. Auction Lot
10. Transaction
11. Observation
12. Signal
13. Score
14. Index Point
15. Publication

## Core Entity Boundaries

### Artist
A canonical creator identity. Artist records are immutable and may absorb aliases, transliterations, studio names, and legacy catalog forms.

### Artwork
A canonical intellectual work identity. An Artwork is distinct from a physical object, edition copy, auction lot, or transaction.

### Edition
A bounded production expression of an Artwork. Edition attributes include edition size, artist proof count, publisher, fabrication method, and release date.

### Object Instance
A specific physical object or edition copy. Ownership, condition, certificates, and object-level provenance attach here.

### Provenance Event
A dated ownership, custody, exhibition, publication, authentication, or legal-status event linked to an Object Instance or Artwork.

### Exhibition
A public or private display event with institution, venue, dates, curatorial context, and evidence.

### Auction Lot
A market offering that may include one or more objects. It is not equivalent to the Artwork or Transaction.

### Transaction
A completed or cancelled market event with price, currency, premium treatment, date, venue, buyer/seller visibility, and confidence.

### Observation
A timestamped, source-specific fact. Examples: estimate, hammer price, premium-inclusive price, unsold status, exhibition inclusion, or media mention.

### Signal
A normalized analytical event derived from one or more observations.

## Initial Segment Taxonomy

- Post-War and Contemporary
- Modern
- Impressionist
- Old Masters
- Emerging Artists
- Blue-Chip Contemporary
- Photography
- Prints and Multiples
- Sculpture
- Digital and New Media
- Asian Contemporary
- Korean Art
- Chinese Contemporary
- Japanese Contemporary
- African and Diaspora Art
- Latin American Art

## Market Status Vocabulary

- announced
- catalogued
- offered
- sold
- bought_in
- withdrawn
- private_sale_reported
- disputed
- corrected

## Condition Vocabulary

- pristine
- excellent
- very_good
- good
- fair
- poor
- unknown

## Provenance Confidence

- A: documentary chain verified
- B: strong multi-source support
- C: partial but credible support
- D: weak or incomplete support
- U: unverified
- X: disputed or blocked

## One Fact, One Home

Canonical facts reside in the Artfund domain data store. Portals, indices, reports, APIs, and archives must reference the canonical record rather than maintain competing copies.

## Governance Requirements

Every commercial intelligence record must expose:

- canonical identifier
- source coverage
- evidence links
- rights status
- confidence grade
- methodology version where derived
- created and updated timestamps
- correction and restatement history

## Versioning

Taxonomy changes require semantic versioning, effective date, migration notes, and backward compatibility guidance.
