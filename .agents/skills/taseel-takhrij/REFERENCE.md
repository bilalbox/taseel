# Ta'seel Takhrij: Reference & Guardrails

## 1. Jurisprudential Takhrij Methodology

When evaluating a fatwa from *Noor 'ala al-Darb*, determine whether the scholar derives the ruling through legal reasoning (*ta'lil* / *takhrij*) or merely cites direct textual proof.

### Primary Proof Citation vs. Legal Principle

| Category | Description | Outcome |
| :--- | :--- | :--- |
| **Primary Proof Citation** (*Dalil Tafsili*) | Scholar cites an explicit Quranic ayah, authentic hadith, or direct consensus establishing the first-order ruling without debating meta-rules or linguistic dalalat. | `has_applicable_principle: false` |
| **Linguistic Textual Deduction** (*Dalalat al-Alfaz*) | Scholar derives obligation, prohibition, invalidity, or generality from the linguistic construction of the quoted verse or hadith (e.g. `usul.alfaz.*`). | `has_applicable_principle: true` (`science = 'usul'`) |
| **Explicit Verbatim Principle** | Scholar cites the canonical text of a Qaidah or Dabit verbatim (e.g. "اليقين لا يزول بالشك"). | `has_applicable_principle: true`, `invocation_type: "explicit_verbatim"` |
| **Explicit Paraphrase** | Scholar uses a known scholarly alias or explicit paraphrased rule (e.g. "الأصل بقاء الطهارة"). | `has_applicable_principle: true`, `invocation_type: "explicit_paraphrase"` |
| **Implicit Application** | Scholar derives an unstated ruling using the causal mechanics (*manat*) of a maxim without reciting its name. | `has_applicable_principle: true`, `invocation_type: "implicit_application"` |

---

## 2. Mandatory Guardrails

### Guardrail A: Routine Scripture & Hadith Citations
- **Do NOT** link `fiqh.mashaqqah.maysur` merely because the scholar says ﴿فَاتَّقُوا اللَّهَ مَا اسْتَطَعْتُمْ﴾. Only link if the scholar uses inability to excuse part of a composite obligation while leaving the feasible part intact.
- **Do NOT** link `fiqh.maqasid` merely because the scholar quotes «إنما الأعمال بالنيات». Only link if the scholar differentiates between legal outcomes based on the intention of the actor.
- **Do NOT** link `usul.adillah.ijma` or `usul.adillah.sunnah` just because the scholar says "بالإجماع" or cites a hadith. Only link if discussing epistemic authority (e.g., whether khabar al-wahid overrules qiyas).

### Guardrail B: Legislative Wisdom (*Hikmah*) vs. Legal Rule (*Qaidah*)
- Explaining *why* Allah enacted a law (e.g. "Allah desires the persistence of marriage so he limited divorce times") is *hikmat al-tashri'*. It is **never** a ground for *Al-Aslu Baqau Ma Kana 'Ala Ma Kan* or *Istishab*.

### Guardrail C: Operational Conditions of Istishab
- *Al-Aslu Baqau Ma Kana 'Ala Ma Kan* (`fiqh.yaqeen.baqaa`) requires:
  1. An established prior certainty (e.g., wudu was made, marriage was contracted).
  2. A newly arising doubt (*shakk*) or unverified allegation of change.
  3. A decision to uphold the prior certainty against the weaker doubt.

### Guardrail D: Specificity & Multi-Branch Grounding
- Prefer deeper chapter-specific dawabit (e.g. `fiqh.yaqeen.baqaa.taharah` at depth 2) over abstract universal maxims (`fiqh.yaqeen` at depth 0).
- If multiple independent root branches apply (e.g. `fiqh.mashaqqah` + `fiqh.darar`), include both invocations.

---

## 3. Output JSON Schema (per Fatwa)

Each line in `pipeline/data/llm_jobs/batch_NNNN.response.jsonl` must be a valid JSON object matching:

```json
{
  "fatwa_id": "baz-XXXX",
  "has_applicable_principle": true,
  "invocations": [
    {
      "principle_id": "fiqh.yaqeen.baqaa.taharah",
      "matched_alias_id": null,
      "invocation_type": "explicit_paraphrase",
      "evidence_quote_ar": "Exact substring from answer_text (محل الشاهد)",
      "application_explanation_ar": "1-2 concise Arabic sentences on تحقيق المناط explaining how the rule produces the ruling.",
      "difficulty": "intermediate",
      "confidence_score": 0.88,
      "proposed_new_dabit": null
    }
  ]
}
```

If no principle applies, output:
```json
{"fatwa_id": "baz-XXXX", "has_applicable_principle": false, "invocations": []}
```
