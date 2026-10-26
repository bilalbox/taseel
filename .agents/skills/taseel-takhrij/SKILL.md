---
name: taseel-takhrij
description: Performs rigorous Islamic jurisprudence takhrij (grounding fatwas on Qawa'id Fiqhiyyah, Usuliyyah, and Dawabit) across Noor 'ala al-Darb archives without external API keys. Use when the user asks to run takhrij, extract or enrich principles from fatwas, review legal grounding, or process Stage 3D takhrij batches.
---

# Ta'seel Takhrij (تأصيل وتخريج الفتاوى)

Teach the coding agent to act as an expert jurisprudential specialist in *Usul al-Fiqh* and *Al-Qawa'id Al-Fiqhiyyah* to extract legal principles from the *Noor 'ala al-Darb* fatwa archives (Shaykh Ibn Baz & Shaykh Ibn Uthaymeen).

## Quick Start (Batch Lifecycle)

To run a takhrij batch directly through the coding agent:

1. **Check Status or Plan:**
   ```bash
   PYTHONPATH=pipeline/src python3 pipeline/src/llm_batch_enrich.py plan
   PYTHONPATH=pipeline/src python3 pipeline/src/llm_batch_enrich.py status
   ```

2. **Export a Batch:**
   ```bash
   # Export a batch (e.g. for a specific chapter like Nikah, Taharah, Salat, or max jobs)
   PYTHONPATH=pipeline/src python3 pipeline/src/llm_batch_enrich.py export --chapter Nikah --max-jobs 10
   # Or include deterministically grounded fatwas to audit/clean them:
   PYTHONPATH=pipeline/src python3 pipeline/src/llm_batch_enrich.py export --chapter Nikah --max-jobs 10 --include-grounded
   ```

3. **Read Prompt and Jobs:**
   Inspect `pipeline/data/llm_jobs/batch_NNNN.prompt.md` and `batch_NNNN.jobs.json`.

4. **Reason & Generate Response:**
   Evaluate each fatwa against the candidate principles using the **Usuli Guardrails** (see [REFERENCE.md](REFERENCE.md)).
   Write the results to `pipeline/data/llm_jobs/batch_NNNN.response.jsonl` (one JSON object per fatwa).

5. **Validate & Ingest:**
   ```bash
   PYTHONPATH=pipeline/src python3 pipeline/src/llm_batch_enrich.py check batch_NNNN
   PYTHONPATH=pipeline/src python3 pipeline/src/llm_batch_enrich.py ingest batch_NNNN
   ```

6. **Recompile SQLite Database (when ready):**
   ```bash
   PYTHONPATH=pipeline/src python3 pipeline/src/compile_sqlite.py
   ```

## Core Jurisprudential Guardrails

Always apply these essential rules during takhrij:

1. **Primary Proof Citation Rule:** If the ruling rests on an explicit textual proof (*dalil tafsili*: a specific Quranic verse, Sahih hadith, or direct consensus) without deriving an unstated branch, return `has_applicable_principle: false`.
2. **Wisdom (*Hikmah*) is NOT a Maxim:** Explaining the legislative wisdom/intent (e.g. "the Lawgiver desires the persistence of marriage") is *hikmat al-tashri'*, NOT *takhrij* on *Al-Aslu Baqau Ma Kana 'Ala Ma Kan*.
3. **True Istishab Requires Uncertainty:** *Al-Aslu Baqau Ma Kana 'Ala Ma Kan* requires an established prior certainty and a newly arising doubt (*shakk*).
4. **No Spurious Usul Grounding:** Never link to `usul.adillah.ijma` or `usul.adillah.sunnah` just because the scholar cites consensus or a hadith, unless they actively discuss the epistemological authority of the proof.
5. **Specificity:** Prefer chapter-specific *dawabit* over root universal maxims (*qawa'id kubra*) when applicable.
6. **Authentic *Tahqiq al-Manat*:** Write 1–2 authentic Arabic sentences explaining *how* the principle produces the ruling. Never use generic template boilerplate.

See [REFERENCE.md](REFERENCE.md) for full guardrails and schema, and [EXAMPLES.md](EXAMPLES.md) for case studies.
