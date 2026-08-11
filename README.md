# Pacte

Pacte is a small **data contract control plane**. Before a batch reaches a data platform, it answers four practical questions:

1. Does it still respect the schema we agreed on?
2. Is the data usable enough for downstream teams?
3. What will be affected if it is accepted anyway?
4. Who can understand the decision later?

The project validates CSV batches against versioned contracts, detects schema drift and quality failures, maps downstream impact, and records each ingestion decision in a local SQLite audit log.

## Run locally

```bash
cd pacte
PYTHONPATH=src python3 -m pacte.server
```

Open `http://localhost:8090`, choose a batch and run its validation.

## What is inside

- `contracts/orders.json`: a versioned contract owned by the Billing domain;
- `data/`: a clean batch and batches with data or schema issues;
- `src/pacte/`: validation, impact mapping, SQLite audit and HTTP API;
- `web/`: a no-build control room;
- `tests/`: contract and validation tests;
- `docs/working-paper.md`: design choices, limits and next steps.

## API

- `GET /api/overview`
- `GET /api/audit`
- `POST /api/validate` with `{ "batch": "orders_clean.csv" }`

## Why it matters

This is a personal project. It is not a claim that a local script replaces a data governance platform. It is a way to explore a production question: **how do we turn an implicit data assumption into an explicit, testable and auditable agreement?**
