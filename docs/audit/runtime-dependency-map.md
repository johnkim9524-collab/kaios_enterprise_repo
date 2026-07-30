# Runtime Dependency Map

## Purpose

Define the canonical Kidults and Artfund execution flow, identify shared KAIOS Core capabilities, and expose possible overlap or bypass paths.

## Target Canonical Flow

```text
Source Adapters
    ↓
Source Execution Control
    ↓
Entity Resolution
    ↓
Deterministic Scoring
    ↓
Quality Anomaly Engine
    ↓
Autonomous Report Engine
    ↓
Publication Orchestrator
    ↓
Index Auto Publisher / Portal Export
    ↓
Dual Portal API Wiring
    ↓
Kidults or Artfund Portal
    ↓
Quality Certification
    ↓
Alerting / Evidence / Rollback
