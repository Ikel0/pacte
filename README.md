# Pacte

Pacte is a compact **data admission gate** for batch pipelines. Before an order extract can be published, it answers four practical questions:

1. Does the file still satisfy the agreed contract?
2. Which controls failed, and how many records do they affect?
3. Which declared consumers must stop or wait for review?
4. Can someone reproduce the decision later from the exact input and contract?

**Live demo:** https://pacte-ikel.onrender.com

The project validates CSV batches against a versioned contract, detects schema drift and quality failures, maps the downstream consequence, and stores an idempotent SQLite audit receipt. It is deliberately small enough to read end to end while retaining the pieces teams need to discuss in a real data platform.

## What happens to a batch

```text
CSV input + versioned contract
        -> schema, validity, key and volume controls
        -> admission decision
        -> declared consumer impact
        -> immutable receipt for this exact input
```

The gate is intentionally conservative:

- `accept`: publication may proceed.
- `accept_with_warnings`: publication pauses for contract-owner review.
- `quarantine`: publication is closed and critical or high-tier consumers are blocked.

The demo records that decision and its intended impact. It does not execute a production write or stop a real scheduler, which keeps the boundary explicit and safe.

## What is checked

- contract configuration is validated on startup, including owner, semantic version, field definitions and declared consumers;
- required fields, types, numeric bounds, allowed values and business-key uniqueness;
- duplicate or missing headers, rows with values outside the declared schema, empty input and unexpected columns;
- a SHA-256 fingerprint of both the raw batch and the evaluated contract;
- a deterministic run ID and idempotent audit receipt, so repeating an unchanged validation does not silently add another decision;
- a lineage plan showing whether each declared consumer is clear, under review or blocked.

## Run locally

```bash
cd pacte
PYTHONPATH=src python3 -m pacte.server
```

Open `http://localhost:8090`, choose one of the three supplied batches and inspect the controls, consumer impact and receipt.

## Test it

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

The suite covers clean admission, schema drift, data-quality quarantine, empty input, invalid contracts and idempotent receipts.

## API

- `GET /api/health` exposes the loaded contract version and fingerprint.
- `GET /api/overview` exposes the demo contract, available batches and recent receipts.
- `GET /api/audit` returns compact receipt history.
- `GET /api/runs/{run_id}` retrieves one reproducible validation record.
- `POST /api/validate` with `{ "batch": "orders_clean.csv" }` runs the admission gate.

## Project boundary

This is a personal project, not a claim that SQLite replaces a governance platform. In a team environment, the same decision object could be emitted by an orchestrator, stored in a shared audit system, linked to a catalog and routed to the owner through alerting. The point of Pacte is to make an implicit upstream assumption explicit, testable and explainable before downstream tables become unreliable.

The accompanying [working paper](docs/working-paper.md) documents the choices, trade-offs and next experiments.
