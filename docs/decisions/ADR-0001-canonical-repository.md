\# ADR-0001: Canonical Repository Root



\## Status



Accepted



\## Context



The initial repository stored the application inside duplicated nested directories. This prevented predictable local execution, CI validation, and deployment configuration.



\## Decision



The Git repository root is the canonical project root.



The following directories must exist directly under the Git root:



```text

app/

config/

data/

docs/

public/

scripts/

tests/
