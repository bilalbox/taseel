# Noor 'ala al-Darb Jurisprudence & Quiz Domain

This context models Islamic legal principles (*Al-Qawa'id Al-Fiqhiyyah* and *Al-Qawa'id Al-Usuliyyah*) and their application to fatwas from the *Noor 'ala al-Darb* archives of Shaykh Ibn Baz and Shaykh Ibn Uthaymeen.

## Legal Principles Ontology

**Principle (قاعدة / أصل)**:
A self-contained, quotable legal proposition of Fiqh or Usul al-Fiqh occupying a single node in a variable-depth (`parent_id`) hierarchy.
_Avoid_: Chapter title, topic header, tag

**Domain Section (مبحث / باب العلم)**:
The classical thematic chapter to which a Principle belongs (such as *Dalalat al-Alfaz* or *Al-Adillah* in Usul, or *Taharah* and *Buyu'* in Fiqh), stored as an attribute rather than a parent node in the proposition tree.
_Avoid_: Tier 0 principle, parent principle

**Qa'idah Kubra (قاعدة فقهية كبرى — `qa_idah_kubra`)**:
One of the overarching universal maxims of Fiqh (such as *Certainty is not overruled by doubt*) at the root of a Fiqh branch (`depth = 0`).

**Qa'idah Kulliyyah (قاعدة كلية مندرجة — `qa_idah_kulliyyah`)**:
A general Fiqh maxim that applies across multiple chapters of Fiqh while branching under a *Qa'idah Kubra*.
_Avoid_: Synonym, alias, dabit

**Dabit Fiqhi (ضابط فقهي — `dabit_fiqhi`)**:
A Fiqh principle whose scope is restricted to a single chapter of Fiqh (such as Taharah or Buyu').

**Asl Kulli (أصل أصولي كلي — `asl_kulli`)**:
A foundational principle of *Usul al-Fiqh* establishing the authority of a source of law or a major pillar of legal deduction (such as *Established consensus is a definitive proof* or *A general text must be acted upon in its generality*).

**Qa'idah Usuliyyah (قاعدة أصولية — `qa_idah_usuliyyah`)**:
A general methodological or linguistic rule of *Usul al-Fiqh* branching under an *Asl Kulli* (such as *Consideration is given to the generality of the wording, not the specificity of the cause*).

**Dabit Usuli (ضابط أصولي تطبيقي — `dabit_usuli`)**:
A specific operational condition or criterion refining an *Usul* principle (such as *When a Companion narrator acts contrary to his narration, weight is given to his narration rather than his opinion*).

**Alias (صيغة بديلة — Sighah)**:
An alternative scholarly or colloquial wording that expresses the exact same Principle without changing its legal scope or node identity.
_Avoid_: Sub-principle, child node

**Contrast Pair (قاعدتان متقابلتان)**:
Two Principles that share a surface similarity or complementary boundary and serve as high-precision quiz distractors.

## Archive, Extraction & Assessment

**Fatwa (فتوى)**:
A single question-and-answer exchange between a questioner and a Scholar within a recorded *Noor 'ala al-Darb* episode.

**Issue Cluster (وحدة المسألة الفقهية)**:
A canonical legal case that groups multiple Fatwas asking the same underlying question across different episodes or Scholars.
_Avoid_: Duplicate fatwa, domain section

**Primary Proof Citation (استدلال بدليل تفصيلي)**:
A Scholar's routine citation of a Quranic verse, Prophetic hadith, or consensus (*"forbidden by consensus"*) as direct evidence for a ruling without debating or invoking the methodological meta-rule itself; excluded from `fatwa_principles`.

**Evidence Quote (محل الشاهد والتعليل)**:
The exact clause in a Scholar's answer where one or more Principles are actively invoked as the causal legal reasoning (*ta'lil*) to justify the ruling.

**Multi-Principle Ruling (حكم مركب التعليل)**:
A Fatwa whose ruling rests on the intersection of multiple Principles simultaneously (either via a multi-parent Principle or multiple rows in `fatwa_principles`), triggering a *"Select all principles that apply"* quiz prompt.

**Quiz Attempt (محاولة اختبار)**:
A recorded user response matching a Fatwa to a candidate Principle, storing correctness, time spent, and the selected choice.
_Avoid_: Flashcard, review card, SRS interval

