# 4. Ingestion and Takhrij of Usuli Dalalat al-Alfaz Principles

Date: 2026-10-28

## Context

In _Noor 'ala al-Darb_, fatwas routinely cite Quranic verses and Prophetic hadiths. Previously, fatwas relying on direct textual evidence were broadly categorized as _Primary Proof Citations_ (استدلال بدليل تفصيلي) and excluded from principle linking. While direct proof citations without legal derivation rarely fit _Al-Qawa'id Al-Fiqhiyyah_ (where rulings stem from substantive maxims like _Al-Yaqin La Yazul Bi-Shakk_), they are primary candidates for _Al-Qawa'id Al-Usuliyyah_—specifically _Dalalat al-Alfaz_ (دلالات الألفاظ) such as:
- الأمر المطلق يقتضي الوجوب
- النهي يقتضي الفساد والتحريم
- النكرة في سياق النفي تفيد العموم
- العبرة بعموم اللفظ لا بخصوص السبب
- حمل المطلق على المقيد

However, the pipeline had three structural blockers:
1. `triage_fatwa_reasoning` in `pipeline/src/arabic_norm.py` discarded ~5,640 fatwas lacking Fiqh causal markers.
2. `candidate_subgraph_ids` in `pipeline/src/llm_batch_enrich.py` only injected chapter dawabit and `qa_idah_kubra`, completely omitting Usul principles (`asl_kulli`) from candidate pools.
3. `pipeline/seed/ontology.json` lacked core _Dalalat al-Alfaz_ principles (such as _Al-Nakirah fi Siyaq al-Nafy_ and _Al-Mutlaq wa al-Muqayyad_) and their Usuli contrast pairs.

## Decision

1. **Clarify Domain Boundary in Glossary**:
   - Maintain exclusion for bare, uncontested _Primary Proof Citations_ (استدلال بدليل تفصيلي) where scripture is cited without methodological or linguistic derivation.
   - Introduce _Linguistic Textual Deduction_ (استدلال بدلالة اللفظ الأصولية) for rulings derived via operative rules of _Dalalat al-Alfaz_, eligible for `fatwa_principles` under `science = 'usul'`.

2. **Expand Ontology with Dalalat al-Alfaz Taxonomy**:
   - Seed missing _Dalalat al-Alfaz_ principles under `usul.alfaz.*` in `pipeline/seed/ontology.json`, including specific sub-principles for command/prohibition nuances (_fawr_, _amr ba'd al-hazar_, _sarf ila al-nadb/karahah_).
   - Add classical Usuli `contrast_pair` relations (e.g. _Wujub_ vs _Nadb_, _Fawr_ vs _Tarakhi_, _Tahrim_ vs _Karahah_) to ensure high-contrast quiz distractors.

3. **Refine Pre-Triage & Candidate Injection**:
   - Update `CAUSAL_MARKERS` with Usuli linguistic indicators (`صيغة الأمر`, `دلالة`, `النهي يقتضي`, `النفي`, `العموم`, `المقيد`, `المطلق`, `صارف`, `الظاهر`).
   - Update `candidate_subgraph_ids` and `_retrieve_candidates` to systematically inject `usul.alfaz` candidates when scripture citations or linguistic markers are present.
   - Refine prompt instructions in `llm_batch_enrich.py` and `.agents/skills/taseel-takhrij/SKILL.md` to exempt _Dalalat al-Alfaz_ from routine citation exclusion.

4. **Support Dual Invocations (Fiqh + Usul)**:
   - Allow multi-principle rulings combining both an Usuli linguistic deduction and a substantive Fiqh maxim for the same fatwa.

5. **Validation Guardrails**:
   - Require `validate_fatwa_response` to verify that `evidence_quote_ar` contains operative linguistic markers corresponding to the linked _Dalalat al-Alfaz_ rule.

6. **Phased Scope Pilot on Kitab al-Taharah**:
   - Pilot the refined pipeline specifically on **Kitab al-Taharah (كتاب الطهارة)** (1,032 fatwas) to calibrate model prompts, deterministic matchers, and triage thresholds before running across the full 19,300+ fatwa archive.

## Consequences

- Bumps ontology version to `2026.10.28-dalalat-alfaz`.
- Re-triages Taharah fatwas, promoting ~330 previously skipped fatwas for Usuli takhrij evaluation.
- Quiz engine serves dedicated Usuli deduction questions with pedagogically aligned Usuli distractors.
