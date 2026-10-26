# Ta'seel Takhrij: Case Examples

## Example 1: Negative — Direct Textual Proof (Pregnant Woman Divorce `baz-2`)

- **Question:** هل المرأة الحامل يجوز عليها الطلاق، أي: تطلق وهي حامل؟
- **Answer Summary:** Shaykh Ibn Baz states that divorce of a pregnant woman takes effect and is *Sunni*, citing the Hadith of Ibn Umar («ثم ليطلقها طاهراً أو حاملاً»), the verse ﴿فَطَلِّقُوهُنَّ لِعِدَّتِهِنَّ﴾, and unanimous consensus. He then mentions that Allah desires the persistence of marriage as the wisdom for restricting divorce.
- **Evaluation:**
  - Direct scriptural proof (*Dalil Tafsili*).
  - "بقاء النكاح" is *Hikmat al-Tashri'*, not *Istishab*.
  - Outcome: `has_applicable_principle: false`.
- **JSON Response:**
```json
{"fatwa_id": "baz-2", "has_applicable_principle": false, "invocations": []}
```

---

## Example 2: Positive — Istishab in Taharah (`baz-161`)

- **Question:** هل مس المرأة ينقض الوضوء؟
- **Answer Summary:** Shaykh Ibn Baz argues that touching a woman does not break wudu unless there is a clear proof, because the established state is sound purity.
- **Evaluation:**
  - The scholar actively invokes the persistence of established purity against the claimed nullifier.
  - Principle: `fiqh.yaqeen.baqaa.taharah` (Dabit Fiqhi under Yaqeen).
  - Outcome: `has_applicable_principle: true`.
- **JSON Response:**
```json
{
  "fatwa_id": "baz-161",
  "has_applicable_principle": true,
  "invocations": [
    {
      "principle_id": "fiqh.yaqeen.baqaa.taharah",
      "matched_alias_id": null,
      "invocation_type": "explicit_paraphrase",
      "evidence_quote_ar": "ولأن الأصل سلامة الطهارة، وعدم انتقاضها إلا بدليل",
      "application_explanation_ar": "بنى الشيخ بقاء الوضوء بعد مس المرأة على أن الطهارة المتيقنة لا ترتفع إلا بدليل ثابت، فالأصل بقاء الطهارة حتى يثبت الناقض.",
      "difficulty": "intermediate",
      "confidence_score": 0.90,
      "proposed_new_dabit": null
    }
  ]
}
```

---

## Example 3: Positive — Custom / Urf in Physical Distance (`baz-26`)

- **Question:** ما المسافة التي تبيح التيمم عند فقد الماء؟
- **Answer Summary:** Shaykh Ibn Baz assesses whether a ten to fifteen minute walk is considered close or far by referring to customary estimation (*urf*).
- **Evaluation:**
  - The scholar applies customary standard as the operational metric for the legal condition.
  - Principle: `fiqh.adah` (العادة محكمة).
  - Outcome: `has_applicable_principle: true`.
- **JSON Response:**
```json
{
  "fatwa_id": "baz-26",
  "has_applicable_principle": true,
  "invocations": [
    {
      "principle_id": "fiqh.adah",
      "matched_alias_id": null,
      "invocation_type": "explicit_paraphrase",
      "evidence_quote_ar": "هذه المسافة تعتبر قريبة عرفاً، فالواجب الذهاب إلى الماء",
      "application_explanation_ar": "أحال الشيخ تقدير بُعد الماء الذي يبيح التيمم إلى العرف، فحكم بأن عشر دقائق إلى ربع ساعة قريب عرفاً فلا عذر للتيمم، وهذا إحالة صريحة إلى العادة والعرف.",
      "difficulty": "beginner",
      "confidence_score": 0.92,
      "proposed_new_dabit": null
    }
  ]
}
```

---

## Example 4: Negative — Routine Admonition (Long Nails `baz-430`)

- **Question:** حكم إطالة المرأة أظفارها؟
- **Answer Summary:** Shaykh Ibn Baz mentions that nails should not be kept long, citing the fitrah hadith timing the clipping to 40 days.
- **Evaluation:**
  - Text contains the word "بقاء" ("ما ينبغي بقاء الأظافر طويلة"), but this is purely literal Arabic usage, not the legal maxim *Al-Aslu Baqau Ma Kana 'Ala Ma Kan*.
  - Outcome: `has_applicable_principle: false`.
- **JSON Response:**
```json
{"fatwa_id": "baz-430", "has_applicable_principle": false, "invocations": []}
```
