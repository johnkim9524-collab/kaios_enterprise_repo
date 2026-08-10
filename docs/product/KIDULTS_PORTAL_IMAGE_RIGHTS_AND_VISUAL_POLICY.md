# KIDULTS Portal Image Rights & Visual Policy

## Decision

Product/object photography is a core eye-catching factor in KIDULTS. The portal SHOULD display real product/object imagery when the legal basis for display is evidenced. The portal MUST NOT treat public visibility on the internet as permission.

## Strategic role of imagery

Images are not decorative filler. They support discovery, recognition, emotional engagement, category navigation, object intelligence, WHY narratives and collection-building workflows. Product photography should therefore be integrated into Kidult 100 cards, Object Intelligence, WHY Now, Compare, Collection Lab, Institution Desk and Research surfaces whenever rights allow.

## Rights hierarchy

Preferred image supply order:

1. KIDULTS-owned photography or commissioned work with transferred/adequate rights.
2. Directly licensed brand, manufacturer, creator, auction, dealer, institution or partner photography.
3. CC0 / confirmed public-domain / explicitly commercial-reuse Open Access imagery.
4. Licensed third-party image providers with commercial display rights.
5. Rights-unclear imagery is blocked and replaced with a neutral object placeholder until reviewed.

Fair use is not the default supply strategy for persistent commercial portal imagery.

## Image Rights Registry

Every displayed image must carry internal machine-readable evidence fields: imageSource, copyrightOwner, license, rightsBasis, commercialUseAllowed, displayAllowed, attributionRequired, derivativeAllowed, licenseExpiry, evidenceUrl, sourceUrl, payloadHash and lastVerifiedAt.

## Portal Preflight

Before an image is rendered:

VALUE -> IMAGE RIGHTS -> COMMERCIAL DISPLAY -> ATTRIBUTION -> TRADEMARK/PUBLICITY/PRIVACY CHECK WHERE RELEVANT -> EXPIRY -> DISPLAY

Allowed outcomes:
- ALLOW
- ALLOW_WITH_ATTRIBUTION
- HOLD_LEGAL_REVIEW
- BLOCK

If rights expire or are revoked, the image is automatically removed or replaced without changing the information architecture.

## UX rule

New images enrich stable portal modules. Images do not dictate IA changes. The same object card can render either a rights-cleared photograph or a high-quality neutral placeholder without changing layout, scoring, WHY, evidence or decision contracts.

## Collector vs Institution treatment

Collector surfaces may use more immersive object photography and visual discovery. Institution surfaces use the same imagery more conservatively, with visible provenance/source/rights metadata available in the evidence layer.

## Current approved source examples

- KIDULTS-owned or directly licensed images: preferred.
- The Metropolitan Museum of Art Open Access images marked for unrestricted reuse under CC0: eligible subject to item-level confirmation and other applicable rights.
- Other CC0 / public-domain / explicitly commercial-reuse collections: eligible only after item-level evidence capture.

This policy is subordinate to applicable law and specific source/license terms; uncertain cases fail closed.
