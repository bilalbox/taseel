# 3. Unified In-Process Takhrij Grounding Engine

Date: 2026-10-27

## Context

Deterministic Fatwa→Principle linking lived in three places: the Stage 3 ontology graph scorer (`extract_and_ground_fatwa`), a ~34-block hand-written chapter rule engine (`evaluate_fatwa`), and post-hoc epistemic guardrails on LLM ingest. The same Fatwa could receive different Principles depending on path; matching knowledge lived as Python conditionals; and there was no regression contract for grounding behaviour.

## Decision

Collapse deterministic Takhrij into one deep module behind a single public seam:

```text
ground_fatwa(fatwa, ontology, *, candidate_ids=None) -> GroundingResult
```

- Matching rules, precision negatives (`grounding_skips`), epistemic markers, and default تحقيق المناط explanation templates live as declarative metadata on ontology Principle nodes (and root-level skip rules).
- When `candidate_ids` is omitted the grounder retrieves its own candidate subgraph; when provided, linking is restricted to that set (chapter / job behaviour).
- Quality bar is precision-first: migrate clearly expressible legacy rules into match metadata; hard multi-condition implicits that fight declarative form yield no deterministic link and remain eligible for LLM enrichment.
- Explanation policy: Stage 3 fills each Principle's Arabic template; `merge_fatwa_links` lets validated LLM extractions overwrite explanation, evidence quote, and difficulty on overlap while preserving string-verified deterministic invocation type / alias preference.
- `validate_fatwa_response` remains the trust boundary for untrusted agent JSON and consumes the same ontology epistemic markers as the grounder.
- Compile Stage 3, chapter Takhrij evaluation, and LLM eligibility baseline all call `ground_fatwa` only. The legacy rule engine and graph-scorer public seam are removed.

## Consequences

- Ontology version bumps when match specs or templates change materially (cutover: `2026.10.27-grounding`).
- Golden Fatwa corpus tests assert only through `ground_fatwa`, `validate_fatwa_response`, and `merge_fatwa_links`.
- Future agents must not reintroduce a second deterministic engine; extend ontology match metadata or LLM enrichment instead.
- Deterministic recall is not guaranteed to match every historical legacy-engine link; wrong Principles are rarer by design.
