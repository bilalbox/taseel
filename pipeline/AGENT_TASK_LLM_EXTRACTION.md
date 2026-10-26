# Agent Handoff Spec: Option 2 — Resumable LLM Structured-Output Extraction Pass for Ta'seel (تأصيل)

## 1. Objective
Enhance Stage 3 of the **Ta'seel (تأصيل)** offline data pipeline ([`pipeline/src/extractor.py`](file:///home/bilal/mycode/usul/pipeline/src/extractor.py)) with an **asynchronous, checkpointed LLM Structured-Outputs batch pass** to extract **implicit** *Qawa'id Fiqhiyyah*, *Qawa'id Usuliyyah*, and chapter-specific *Dawabit* across the full **19,301-fatwa** *Noor 'ala al-Darb* archive (Shaykh Ibn Baz & Shaykh Ibn Uthaymeen).

---

## 2. Current Architecture & Baseline State
All raw archives, ontology seeds, clustering, and SQLite/FTS5 compilation are already implemented and verified:
- **Raw Archives (Cached in `pipeline/data/`):**
  - `pipeline/data/ibn_baz_raw.json`: **12,217** proofread fatwas of Shaykh Ibn Baz.
  - `pipeline/data/uthaymeen_2300_slice.csv`: **7,084** proofread Q&As across all 24 volumes of Shaykh Ibn Uthaymeen (Shamela Book `2300`).
- **Master Ontology ([`pipeline/seed/ontology.json`](file:///home/bilal/mycode/usul/pipeline/seed/ontology.json)):**
  - **44** canonical nodes (`qa_idah_kubra`, `qa_idah_kulliyyah`, `dabit_fiqhi`, `asl_kulli`, `qa_idah_usuliyyah`, `dabit_usuli`), **88** aliases, and **6** cross-branch relations.
- **Stage 2 Deduplication ([`pipeline/src/cluster_issues.py`](file:///home/bilal/mycode/usul/pipeline/src/cluster_issues.py)):**
  - Collapses the **19,301** fatwas into **14,566** unique `issue_clusters`.
- **Stage 3 Deterministic Baseline ([`pipeline/src/extractor.py`](file:///home/bilal/mycode/usul/pipeline/src/extractor.py)):**
  - Currently grounds **805 fatwas (831 links)** via high-precision verbatim, alias, and distinctive token matching, while skipping **5,646** fatwas that lack causal reasoning or only contain routine proof citations (`بالكتاب والسنة والإجماع`).
  - The remaining **~12,850** fatwas (belonging to **~9,100** unique `issue_clusters`) contain causal reasoning (`لأن`, `الأصل`, `العبرة`, `الضرورة`, etc.) where the scholar applies a Fiqh/Usul principle **implicitly** without stating its wording verbatim.

---

## 3. Token-Efficient Strategy: Cluster-First + Candidate Subgraph Prompting

Do **not** send all 19,301 fatwas blindly with the entire ontology in every prompt:

1. **Filter via Stage 1 Pre-Triage (`triage_fatwa_reasoning`):**
   - Skip the **5,646** fatwas where `has_causal_reasoning == False` or `is_routine_citation_only == True`.
2. **Deduplicate by `issue_cluster_id` (Representative Fatwa Selection):**
   - For multi-fatwa `issue_clusters` where the same caller question is answered identically, run the LLM extraction on the longest/most detailed answer in the cluster, or batch all member fatwas of the cluster in a single prompt so cross-scholar nuances (Ibn Baz vs. Ibn Uthaymeen) are captured in one call.
3. **Pass Only the Candidate Subgraph (`OntologyGraph.retrieve_candidate_subgraph_fast`):**
   - Include the top 10–15 candidate principles from the fatwa's `topic_chapter` + inverted-index neighborhood, plus the 5 Universal Maxims (`qa_idah_kubra`), so each prompt stays under **~1,200 input tokens**.

---

## 4. Structured Output JSON Schema (`pipeline/src/llm_batch_enrich.py`)

Create `pipeline/src/llm_batch_enrich.py` using the Gemini / OpenAI Structured Outputs SDK with the following schema:

```json
{
  "type": "object",
  "properties": {
    "fatwa_id": { "type": "string" },
    "has_applicable_principle": { "type": "boolean" },
    "invocations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "principle_id": {
            "type": "string",
            "description": "Must match an existing ID from the candidate ontology subgraph, or 'NEW_CANDIDATE' if proposing a new chapter dabit."
          },
          "matched_alias_id": { "type": ["string", "null"] },
          "invocation_type": {
            "type": "string",
            "enum": ["explicit_verbatim", "explicit_paraphrase", "implicit_application"]
          },
          "evidence_quote_ar": {
            "type": "string",
            "description": "Exact verbatim substring from answer_text ('محل الشاهد') demonstrating the causal reasoning."
          },
          "application_explanation_ar": {
            "type": "string",
            "description": "Concise Arabic explanation (1-2 sentences) of how the scholar applied this principle to derive the ruling ('تحقيق المناط')."
          },
          "difficulty": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"]
          },
          "confidence_score": { "type": "number" },
          "proposed_new_dabit": {
            "type": ["object", "null"],
            "properties": {
              "suggested_id": { "type": "string" },
              "parent_id": { "type": "string" },
              "science": { "type": "string", "enum": ["fiqh", "usul"] },
              "kind": { "type": "string", "enum": ["qa_idah_kulliyyah", "dabit_fiqhi", "qa_idah_usuliyyah", "dabit_usuli"] },
              "canonical_text_ar": { "type": "string" },
              "summary_ar": { "type": "string" }
            },
            "required": ["suggested_id", "parent_id", "science", "kind", "canonical_text_ar", "summary_ar"]
          }
        },
        "required": [
          "principle_id",
          "matched_alias_id",
          "invocation_type",
          "evidence_quote_ar",
          "application_explanation_ar",
          "difficulty",
          "confidence_score",
          "proposed_new_dabit"
        ]
      }
    }
  },
  "required": ["fatwa_id", "has_applicable_principle", "invocations"]
}
```

---

## 5. Mandatory Guardrails & Post-Validation Rules

1. **Routine Proof Citation Guardrail:**
   - Reject any link to `usul.adillah.ijma` (`الإجماع حجة قطعية`) or `usul.adillah.sunnah.khabar_wahid` (`خبر الواحد يفيد العمل`) if the scholar is merely citing consensus (`بالإجماع`) or a hadith as direct evidence for a first-order ruling without discussing the authority/epistemic weight of the proof itself.
2. **Most-Specific Node Resolution:**
   - If the LLM outputs both a parent node (e.g. `fiqh.yaqeen`, depth `0`) and its child node (e.g. `fiqh.yaqeen.baqaa.salat_shakk`, depth `2`) on the **same root branch**, keep only the deepest node (`depth = 2`) because the SQLite Recursive CTE automatically rolls child fatwas up to parent nodes.
   - If the LLM outputs nodes from **different root branches** (e.g. `fiqh.mashaqqah` + `fiqh.darar`), preserve both rows in `fatwa_principles` to power `"Select all principles that apply"` (`MULTI_SELECT`) quizzes.
3. **Resumable JSONL Cache (`pipeline/data/llm_extractions.jsonl`):**
   - Append each completed LLM response as a single line in `pipeline/data/llm_extractions.jsonl` and flush immediately.
   - On startup, read `pipeline/data/llm_extractions.jsonl` into a `processed_fatwa_ids` set so interrupted runs resume with zero wasted API calls.
   - Update [`pipeline/src/compile_sqlite.py`](file:///home/bilal/mycode/usul/pipeline/src/compile_sqlite.py) to merge `pipeline/data/llm_extractions.jsonl` (when present) with the deterministic Stage 3 links before compiling `public/content.sqlite3.gz`.
