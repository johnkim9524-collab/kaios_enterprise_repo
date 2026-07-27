\# ADR-0002: Generated Data Policy



\## Status



Accepted



\## Context



KAIOS produces runtime data containing timestamps, fallback signals, health checks, audits, and publishable artifacts.



Uncontrolled tracking of runtime output creates noisy commits and weakens reproducibility.



\## Decision



Generated data is divided into three classes.



\### Runtime-Transient



Not tracked as authoritative source:



```text

data/raw/

data/cache/

data/audit/

Python caches

virtual environments

test caches
