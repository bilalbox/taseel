# 2. On-Demand SQLite Archive Queries Over Main-Thread Dumps

Date: 2026-10-27

## Context

The initial prototype loaded a 250-fatwa dump and all 44 principles into React component state on boot, re-filtering search results using JavaScript string matching (`matchesSearch`). As the archive scales to 19,301 fatwas, transferring large record arrays across the Web Worker boundary increases main-thread memory usage and duplicates SQLite's indexing functionality in client-side JavaScript.

## Decision

We keep the archive query engine deep inside the Web Worker. The engine exposes on-demand parameterized query methods (`getPrinciplesTree`, `browseFatwas`, `getFatwaDetail`, `getRandomQuizQuestion`) executed directly in SQLite via SQL and FTS5. Seed mock data is encapsulated as an internal fallback adapter behind the same interface.

## Consequences

- Eliminates bulk dataset serialization and unbounded memory growth in React state.
- Deletes client-side JavaScript text filtering in favor of SQLite FTS5.
- Distractor generation and contrast-pair selection are executed inside the database engine.
- UI views query only the data necessary to render the active view.
