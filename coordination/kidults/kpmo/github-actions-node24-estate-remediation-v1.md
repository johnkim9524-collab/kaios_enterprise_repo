# GitHub Actions Node 24 Estate Remediation V1

Governing issue: #933

This remediation removes deprecated Node 20 JavaScript-action runtime dependencies from active GitHub Actions workflows, migrates explicit Node 20 execution pins to Node 24, and installs a fail-closed permanent guard.

The migration is control-layer only. It does not authorize provider ingestion, empirical promotion, Production/Public release, external spend, or G5.

Acceptance requires zero deprecated runtime findings from `scripts/kidults/kpmo/github-actions-node24-estate-v1.mjs --check`, successful mutation self-tests, successful Full Value Chain aggregate execution, and exact-head CI success.
