# Noor 'ala al-Darb Jurisprudence & Quiz Domain

This context models Islamic legal principles (_Al-Qawa'id Al-Fiqhiyyah_ and _Al-Qawa'id Al-Usuliyyah_) and their application to fatwas from the _Noor 'ala al-Darb_ archives of Shaykh Ibn Baz and Shaykh Ibn Uthaymeen.

## Legal Principles Ontology

**Principle (قاعدة / أصل)**:
A self-contained, quotable legal proposition of Fiqh or Usul al-Fiqh occupying a single node in a variable-depth (`parent_id`) hierarchy.
_Avoid_: Chapter title, topic header, tag

**Domain Section (مبحث / باب العلم)**:
The classical thematic chapter to which a Principle belongs (such as _Dalalat al-Alfaz_ or _Al-Adillah_ in Usul, or _Taharah_ and _Buyu'_ in Fiqh), stored as an attribute rather than a parent node in the proposition tree.
_Avoid_: Tier 0 principle, parent principle

**Qa'idah Kubra (قاعدة فقهية كبرى — `qa_idah_kubra`)**:
One of the overarching universal maxims of Fiqh (such as _Certainty is not overruled by doubt_) at the root of a Fiqh branch (`depth = 0`).

**Qa'idah Kulliyyah (قاعدة كلية مندرجة — `qa_idah_kulliyyah`)**:
A general Fiqh maxim that applies across multiple chapters of Fiqh while branching under a _Qa'idah Kubra_.
_Avoid_: Synonym, alias, dabit

**Dabit Fiqhi (ضابط فقهي — `dabit_fiqhi`)**:
A Fiqh principle whose scope is restricted to a single chapter of Fiqh (such as Taharah or Buyu').

**Asl Kulli (أصل أصولي كلي — `asl_kulli`)**:
A foundational principle of _Usul al-Fiqh_ establishing the authority of a source of law or a major pillar of legal deduction (such as _Established consensus is a definitive proof_ or _A general text must be acted upon in its generality_).

**Qa'idah Usuliyyah (قاعدة أصولية — `qa_idah_usuliyyah`)**:
A general methodological or linguistic rule of _Usul al-Fiqh_ branching under an _Asl Kulli_ (such as _Consideration is given to the generality of the wording, not the specificity of the cause_).

**Dabit Usuli (ضابط أصولي تطبيقي — `dabit_usuli`)**:
A specific operational condition or criterion refining an _Usul_ principle (such as _When a Companion narrator acts contrary to his narration, weight is given to his narration rather than his opinion_).

**Alias (صيغة بديلة — Sighah)**:
An alternative scholarly or colloquial wording that expresses the exact same Principle without changing its legal scope or node identity.
_Avoid_: Sub-principle, child node

**Contrast Pair (قاعدتان متقابلتان)**:
Two Principles that share a surface similarity or complementary boundary and serve as high-precision quiz distractors.

## Archive, Extraction & Assessment

**Fatwa (فتوى)**:
A single question-and-answer exchange between a questioner and a Scholar within a recorded _Noor 'ala al-Darb_ episode.

**Issue Cluster (وحدة المسألة الفقهية)**:
A canonical legal case that groups multiple Fatwas asking the same underlying question across different episodes or Scholars.
_Avoid_: Duplicate fatwa, domain section

**Primary Proof Citation (استدلال بدليل تفصيلي)**:
A Scholar's routine citation of a Quranic verse, Prophetic hadith, or consensus (_"forbidden by consensus"_) as direct evidence for a ruling without debating or invoking the methodological meta-rule itself; excluded from `fatwa_principles`.

**Linguistic Textual Deduction (استدلال بدلالة اللفظ الأصولية)**:
The derivation of a legal ruling from the linguistic construction of a Quranic verse or Prophetic hadith via an operative rule of _Dalalat al-Alfaz_ (such as imperative denoting obligation, prohibitive denoting invalidity, or indefinite in negation denoting generality); eligible for `fatwa_principles` under `science = 'usul'`.
_Avoid_: Primary proof citation, routine citation

**Evidence Quote (محل الشاهد والتعليل)**:
The exact clause in a Scholar's answer where one or more Principles are actively invoked as the causal legal reasoning (_ta'lil_) to justify the ruling.

**Multi-Principle Ruling (حكم مركب التعليل)**:
A Fatwa whose ruling rests on the intersection of multiple Principles simultaneously (either via a multi-parent Principle or multiple rows in `fatwa_principles`), triggering a _"Select all principles that apply"_ quiz prompt.

**Quiz Attempt (محاولة اختبار)**:
A recorded user response matching a Fatwa to a candidate Principle, storing correctness, time spent, and the selected choice.
_Avoid_: Flashcard, review card, SRS interval
