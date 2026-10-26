import { Episode, Fatwa, Principle, FatwaPrinciple } from '../types';
import { normalizeArabic } from '../utils/arabic';

/** Real binbaz.org CDN clips (Internet Archive sample item never existed → 503). */
const BAZ_104_AUDIO =
  'https://files.zadapps.info/binbaz.org.sa/fatawa/nour_3la_aldarb/nour_104/10401.mp3';
const BAZ_312_AUDIO =
  'https://files.zadapps.info/binbaz.org.sa/fatawa/nour_3la_aldarb/nour_312/31201.mp3';

export const EPISODES_DATA: Episode[] = [
  {
    id: 'ep-ibn-baz-104',
    scholar_name: 'ابن باز',
    episode_number: 104,
    source_url: 'https://binbaz.org.sa/fatwas/episodes/104',
    audio_url: BAZ_104_AUDIO
  },
  {
    id: 'ep-ibn-baz-312',
    scholar_name: 'ابن باز',
    episode_number: 312,
    source_url: 'https://binbaz.org.sa/fatwas/episodes/312',
    audio_url: BAZ_312_AUDIO
  },
  {
    id: 'ep-uthaymeen-45',
    scholar_name: 'ابن عثيمين',
    episode_number: 45,
    source_url: 'https://ibnothaimeen.net/fatwas/episodes/45'
  },
  {
    id: 'ep-uthaymeen-189',
    scholar_name: 'ابن عثيمين',
    episode_number: 189,
    source_url: 'https://ibnothaimeen.net/fatwas/episodes/189'
  }
];

export const PRINCIPLES_DATA: Principle[] = [
  {
    id: 'principle-yaqeen',
    canonical_text_ar: 'اليقين لا يزول بالشك',
    canonical_text_norm: normalizeArabic('اليقين لا يزول بالشك'),
    category: 'fiqhiyyah',
    general_explanation_ar: 'من القواعد الفقهية الخمس الكبرى المتفق عليها؛ ومعناها أن الأمر الثابت بيقين لا يرتفع بمجرد ورود الشك الطارئ عليه، بل يستصحب حكم اليقين السابق حتى يثبت يقين آخر يزيله.',
    english_transliteration: 'Al-Yaqīnu Lā Yazūlu Bish-Shakk'
  },
  {
    id: 'principle-ibaha',
    canonical_text_ar: 'الأصل في الأشياء والمعاملات الإباحة والحل',
    canonical_text_norm: normalizeArabic('الأصل في الأشياء والمعاملات الإباحة والحل'),
    category: 'usuliyyah',
    general_explanation_ar: 'قاعدة أصولية جليلة تقرر أن الأعيان النافعة والتصرفات والمعاملات الدنيوية الأصل فيها الحل والجواز حتى يقوم دليل صريح وصحيح على التحريم، بخلاف العبادات.',
    english_transliteration: 'Al-Aṣlu Fil-Ashyā’i Al-Ibāḥah'
  },
  {
    id: 'principle-tawqeef',
    canonical_text_ar: 'الأصل في العبادات التوقيف والحظر',
    canonical_text_norm: normalizeArabic('الأصل في العبادات التوقيف والحظر'),
    category: 'usuliyyah',
    general_explanation_ar: 'قاعدة أصولية تقتضي ألا يشرع في الدين تقرباً إلى الله من صلاة أو صيام أو ذكر أو هيئة إلا ما شرعه الله ورسوله بنص صحيح، فكل عبادة لا دليل عليها فهي بدعة مردودة.',
    english_transliteration: 'Al-Aṣlu Fil-‘Ibādāti At-Tawqīf'
  },
  {
    id: 'principle-mashaqqah',
    canonical_text_ar: 'المشقة تجلب التيسير',
    canonical_text_norm: normalizeArabic('المشقة تجلب التيسير'),
    category: 'fiqhiyyah',
    general_explanation_ar: 'من القواعد الكبرى الخمس؛ وأساسها رفع الحرج عن المكلفين. إذا طرأت مشقة خارجة عن المعتاد على المكلف بسبب مرض أو سفر أو إكراه رخّص الشارع له بما ييسر عليه.',
    english_transliteration: 'Al-Mashaqqatu Tajlibu At-Taysīr'
  },
  {
    id: 'principle-darar',
    canonical_text_ar: 'الضرر يزال',
    canonical_text_norm: normalizeArabic('الضرر يزال'),
    category: 'fiqhiyyah',
    general_explanation_ar: 'قاعدة كبرى مستقاة من الحديث النبوي "لا ضرر ولا ضرار"، تمنع ابتداء الضرر وتوجب رفعه ودفعه بقدر الإمكان ما لم يؤدِ رفعه إلى ضرر أعظم منه.',
    english_transliteration: 'Aḍ-Ḍararu Yuzāl'
  },
  {
    id: 'principle-dabit-riba',
    canonical_text_ar: 'كل قرض جر نفعاً مشروطاً فهو ربا',
    canonical_text_norm: normalizeArabic('كل قرض جر نفعاً مشروطاً فهو ربا'),
    category: 'dabit',
    general_explanation_ar: 'ضابط فقهي مخصوص بباب القرض والمعاملات المالية؛ فالقرض عقد إرفاق وقربة، فإذا شرط فيه المقرض زيادة مالية أو منفعة عينية تحول العقد إلى معاوضة ربوية محرمة إجماعاً.',
    english_transliteration: 'Kullu Qarḍin Jarra Naf‘an Mashrūṭan Fa-Huwa Ribā'
  },
  {
    id: 'principle-maqasid',
    canonical_text_ar: 'الأمور بمقاصدها',
    canonical_text_norm: normalizeArabic('الأمور بمقاصدها'),
    category: 'fiqhiyyah',
    general_explanation_ar: 'قاعدة كلية أصلها "إنما الأعمال بالنيات"؛ يترتب عليها أن تصرفات المكلف وأقواله وأفعاله تختلف أحكامها الشرعية من حيث الصحة والفساد والحل والحرمة تبعاً لنيته ومقصده.',
    english_transliteration: 'Al-Umūru Bi-Maqāṣidihā'
  },
  {
    id: 'principle-adah',
    canonical_text_ar: 'العادة محكمة',
    canonical_text_norm: normalizeArabic('العادة محكمة'),
    category: 'fiqhiyyah',
    general_explanation_ar: 'قاعدة فقهية كبرى تقضي بأن العرف العام المستقر والمطرد أو الغالب يصار إليه في تحديد معاني الألفاظ والالتزامات والمقادير التي لم يحددها الشارع بضابط مخصوص.',
    english_transliteration: 'Al-‘Ādatu Muḥakkamah'
  }
];

export const FATWAS_DATA: Fatwa[] = [
  {
    id: 'fatwa-101',
    episode_id: 'ep-ibn-baz-104',
    scholar_name: 'ابن باز',
    episode_number: 104,
    question_text: 'رجل توضأ لصلاة الظهر، ثم لما قام لصلاة العصر شك هل أحدث بعد الظهر أم لا زال على طهارته، فما الحكم هل يعيد الوضوء أم يصلي بذلك الوضوء؟',
    answer_text: 'بسم الله الرحمن الرحيم، الحمد لله وصلى الله وسلم على رسول الله. هذا لا يلزمه الوضوء، ما دام توضأ بيقين فإن الطهارة مستمرة، ولا يزول هذا اليقين بمجرد الشك، لقول النبي ﷺ لما شُكي إليه الرجل يخيل إليه أنه يجد الشيء في الصلاة: «لا ينصرف حتى يسمع صوتاً أو يجد ريحاً». فالأصل بقاء الطهارة حتى يتيقن الحدث، فإذا تيقن أنه أحدث بعد الظهر توضأ، أما الشك المحض فلا يلتفت إليه ويبني على طهارته ويصلي ولا حرج عليه.',
    question_norm: normalizeArabic('رجل توضأ لصلاة الظهر، ثم لما قام لصلاة العصر شك هل أحدث بعد الظهر أم لا زال على طهارته، فما الحكم هل يعيد الوضوء أم يصلي بذلك الوضوء؟'),
    answer_norm: normalizeArabic('بسم الله الرحمن الرحيم، الحمد لله وصلى الله وسلم على رسول الله. هذا لا يلزمه الوضوء، ما دام توضأ بيقين فإن الطهارة مستمرة، ولا يزول هذا اليقين بمجرد الشك، لقول النبي ﷺ لما شُكي إليه الرجل يخيل إليه أنه يجد الشيء في الصلاة: «لا ينصرف حتى يسمع صوتاً أو يجد ريحاً». فالأصل بقاء الطهارة حتى يتيقن الحدث، فإذا تيقن أنه أحدث بعد الظهر توضأ، أما الشك المحض فلا يلتفت إليه ويبني على طهارته ويصلي ولا حرج عليه.'),
    topic_domain: 'Fiqh',
    topic_chapter: 'Taharah',
    topic_subtopic: 'الشك في الحدث بعد تيقن الطهارة',
    audio_url: BAZ_104_AUDIO,
    audio_timestamp: 0
  },
  {
    id: 'fatwa-102',
    episode_id: 'ep-uthaymeen-45',
    scholar_name: 'ابن عثيمين',
    episode_number: 45,
    question_text: 'أحسن الله إليكم، نرى بعض الإخوة يبتدعون في الأذكار صيغاً وأعداداً معينة لم ترد في السنة كأن يسبح ألف مرة بعد كل أذان، ويقولون هذا ذكر لله والله تعالى يقول واذكروا الله ذكراً كثيراً، فما توجيه فضيلتكم؟',
    answer_text: 'الجواب: نقول لهؤلاء: بارك الله فيكم، نيتكم طيبة والذكر من أفضل القربات، لكن اعلموا أن العبادات مبناها على الاتباع لا على الابتداع. والقاعدة العظيمة المقررة عند أئمة الإسلام أن الأصل في العبادات المنع والتوقيف حتى يقوم دليل من الكتاب أو السنة على مشروعيتها. فتخصيص عبادة بزمان أو مكان أو عدد أو هيئة لم يعينها الشارع يعتبر بدعة، لأن رسول الله ﷺ قال: «من أحدث في أمرنا هذا ما ليس منه فهو رد». فاقتصروا على ما جاءت به السنة ففيه الكفاية والبركة.',
    question_norm: normalizeArabic('أحسن الله إليكم، نرى بعض الإخوة يبتدعون في الأذكار صيغاً وأعداداً معينة لم ترد في السنة كأن يسبح ألف مرة بعد كل أذان، ويقولون هذا ذكر لله والله تعالى يقول واذكروا الله ذكراً كثيراً، فما توجيه فضيلتكم؟'),
    answer_norm: normalizeArabic('الجواب: نقول لهؤلاء: بارك الله فيكم، نيتكم طيبة والذكر من أفضل القربات، لكن اعلموا أن العبادات مبناها على الاتباع لا على الابتداع. والقاعدة العظيمة المقررة عند أئمة الإسلام أن الأصل في العبادات المنع والتوقيف حتى يقوم دليل من الكتاب أو السنة على مشروعيتها. فتخصيص عبادة بزمان أو مكان أو عدد أو هيئة لم يعينها الشارع يعتبر بدعة، لأن رسول الله ﷺ قال: «من أحدث في أمرنا هذا ما ليس منه فهو رد». فاقتصروا على ما جاءت به السنة ففيه الكفاية والبركة.'),
    topic_domain: 'Usul',
    topic_chapter: 'Salat',
    topic_subtopic: 'تخصيص الأذكار بأعداد وهيئات محدثة',
    audio_timestamp: 88
  },
  {
    id: 'fatwa-103',
    episode_id: 'ep-uthaymeen-189',
    scholar_name: 'ابن عثيمين',
    episode_number: 189,
    question_text: 'سائل يسأل: اقترضت من صديق لي مائة ألف ريال، وطلب مني أن أؤجر له بيتي مدة سنتين بنصف الأجرة المعتادة في السوق كشرط لإقراضي، فهل يجوز هذا العقد؟',
    answer_text: 'هذا العقد محرم ولا يجوز؛ لأن المقرض شرط على المقترض منفعة زائدة وهي تخفيض الأجرة في داره، وقد أجمع العلماء على القاعدة القائلة: كل قرض جر نفعاً مشروطاً فهو ربا. فالقرض المقصود منه الإرفاق والإحسان لوجه الله تعالى، فإذا دخلت فيه المنافع المشروطة أو الهدايا المشروطة انقلب من باب الإرفاق إلى باب المعاوضات الفاسدة والربا الجلي. والواجب إما أن يقرضه خالصاً لوجه الله، أو تستأجر الدار بأجرة المثل دون اشتراط القرض.',
    question_norm: normalizeArabic('سائل يسأل: اقترضت من صديق لي مائة ألف ريال، وطلب مني أن أؤجر له بيتي مدة سنتين بنصف الأجرة المعتادة في السوق كشرط لإقراضي، فهل يجوز هذا العقد؟'),
    answer_norm: normalizeArabic('هذا العقد محرم ولا يجوز؛ لأن المقرض شرط على المقترض منفعة زائدة وهي تخفيض الأجرة في داره، وقد أجمع العلماء على القاعدة القائلة: كل قرض جر نفعاً مشروطاً فهو ربا. فالقرض المقصود منه الإرفاق والإحسان لوجه الله تعالى، فإذا دخلت فيه المنافع المشروطة أو الهدايا المشروطة انقلب من باب الإرفاق إلى باب المعاوضات الفاسدة والربا الجلي. والواجب إما أن يقرضه خالصاً لوجه الله، أو تستأجر الدار بأجرة المثل دون اشتراط القرض.'),
    topic_domain: 'Fiqh',
    topic_chapter: 'Muamalat',
    topic_subtopic: 'اشتراط منفعة أو محاباة في القرض',
    audio_timestamp: 210
  },
  {
    id: 'fatwa-104',
    episode_id: 'ep-ibn-baz-312',
    scholar_name: 'ابن باز',
    episode_number: 312,
    question_text: 'مريض مصاب بجروح بالغة في يديه ووجهه، ويشق عليه استعمال الماء برداً وألماً ويتضرر بذلك بشهادة الأطباء، فماذا يفعل في طهارته؟',
    answer_text: 'إذا كان يضره الماء بشهادة الطبيب المختص أو بالتجربة الظاهرة فإنه يعدل إلى التيمم؛ لقول الله جل وعلا: ﴿وَإِن كُنتُم مَّرْضَىٰ أَوْ عَلَىٰ سَفَرٍ أَوْ جَاءَ أَحَدٌ مِّنكُم مِّنَ الْغَائِطِ أَوْ لَامَسْتُمُ النِّسَاءَ فَلَمْ تَجِدُوا مَاءً فَتَيَمَّمُوا صَعِيدًا طَيِّبًا﴾، ولقوله سبحانه: ﴿وَمَا جَعَلَ عَلَيْكُمْ فِي الدِّينِ مِنْ حَرَجٍ﴾، والقاعدة الشرعية الكبرى: المشقة تجلب التيسير، وقاعدة: الضرر يزال. فيتيمم بالتراب الطاهر ويصلي صلاته، ولا يكلف الله نفساً إلا وسعها.',
    question_norm: normalizeArabic('مريض مصاب بجروح بالغة في يديه ووجهه، ويشق عليه استعمال الماء برداً وألماً ويتضرر بذلك بشهادة الأطباء، فماذا يفعل في طهارته؟'),
    answer_norm: normalizeArabic('إذا كان يضره الماء بشهادة الطبيب المختص أو بالتجربة الظاهرة فإنه يعدل إلى التيمم؛ لقول الله جل وعلا: ﴿وَإِن كُنتُم مَّرْضَىٰ أَوْ عَلَىٰ سَفَرٍ أَوْ جَاءَ أَحَدٌ مِّنكُم مِّنَ الْغَائِطِ أَوْ لَامَسْتُمُ النِّسَاءَ فَلَمْ تَجِدُوا مَاءً فَتَيَمَّمُوا صَعِيدًا طَيِّبًا﴾، ولقوله سبحانه: ﴿وَمَا جَعَلَ عَلَيْكُمْ فِي الدِّينِ مِنْ حَرَجٍ﴾، والقاعدة الشرعية الكبرى: المشقة تجلب التيسير، وقاعدة: الضرر يزال. فيتيمم بالتراب الطاهر ويصلي صلاته، ولا يكلف الله نفساً إلا وسعها.'),
    topic_domain: 'Fiqh',
    topic_chapter: 'Taharah',
    topic_subtopic: 'التيمم عند خوف الضرر والمشقة من الماء',
    audio_url: BAZ_312_AUDIO,
    audio_timestamp: 0
  },
  {
    id: 'fatwa-105',
    episode_id: 'ep-uthaymeen-45',
    scholar_name: 'ابن عثيمين',
    episode_number: 45,
    question_text: 'ما حكم استيراد وبيع أنواع الأطعمة والألبسة الجديدة التي لم تكن معروفة في بلاد المسلمين من قبل إذا لم يرد فيها نص بالتحريم؟',
    answer_text: 'الأصل في المطعومات والملبوسات وسائر المعاملات والأعيان الحل والإباحة حتى يقوم دليل على التحريم. فما دامت هذه الأطعمة طاهرة ولا تشتمل على مسكر أو نجس أو خنزير أو ضرر، وهذه الملابس ليست من لباس الشهرة أو التشبه بالكفار في خصائصهم أو كشف العورات، فالأصل فيها الجواز. قال الله تعالى: ﴿هُوَ الَّذِي خَلَقَ لَكُم مَّا فِي الْأَرْضِ جَمِيعًا﴾. فلا يجوز لأحد أن يحرم ما أحل الله بمجرد الغرابة أو عدم العهد به.',
    question_norm: normalizeArabic('ما حكم استيراد وبيع أنواع الأطعمة والألبسة الجديدة التي لم تكن معروفة في بلاد المسلمين من قبل إذا لم يرد فيها نص بالتحريم؟'),
    answer_norm: normalizeArabic('الأصل في المطعومات والملبوسات وسائر المعاملات والأعيان الحل والإباحة حتى يقوم دليل على التحريم. فما دامت هذه الأطعمة طاهرة ولا تشتمل على مسكر أو نجس أو خنزير أو ضرر، وهذه الملابس ليست من لباس الشهرة أو التشبه بالكفار في خصائصهم أو كشف العورات، فالأصل فيها الجواز. قال الله تعالى: ﴿هُوَ الَّذِي خَلَقَ لَكُم مَّا فِي الْأَرْضِ جَمِيعًا﴾. فلا يجوز لأحد أن يحرم ما أحل الله بمجرد الغرابة أو عدم العهد به.'),
    topic_domain: 'Usul',
    topic_chapter: 'Muamalat',
    topic_subtopic: 'حكم المطعومات والأعيان المستحدثة',
    audio_timestamp: 412
  }
];

export const FATWA_PRINCIPLES_DATA: FatwaPrinciple[] = [
  {
    id: 'fp-101',
    fatwa_id: 'fatwa-101',
    principle_id: 'principle-yaqeen',
    explicitly_stated: true,
    application_explanation_ar: 'استند الشيخ ابن باز إلى قاعدة "اليقين لا يزول بالشك"؛ لأن وضوء المكلف لصلاة الظهر كان يقيناً متحققا، والحدث الطارئ مشكوك فيه، فلا يقوى الشك الأضعف على نقض اليقين الأسبق الأقوى.',
    distractor_principles_json: JSON.stringify([
      {
        id: 'principle-ibaha',
        canonical_text_ar: 'الأصل في الأشياء الإباحة',
        category: 'usuliyyah',
        reason_incorrect: 'هذه قاعدة خاصة بالأعيان والمعاملات الدنيوية، ولا مدخل لها في مسألة ثبوت الحدث ورفع الطهارة.'
      },
      {
        id: 'principle-mashaqqah',
        canonical_text_ar: 'المشقة تجلب التيسير',
        category: 'fiqhiyyah',
        reason_incorrect: 'المشقة تبرر الرخص كالتيمم والمسح، لكن إسقاط الوضوء هنا مبني على بقاء اليقين لا على مشقة الوضوء.'
      },
      {
        id: 'principle-tawqeef',
        canonical_text_ar: 'الأصل في العبادات التوقيف والحظر',
        category: 'usuliyyah',
        reason_incorrect: 'القاعدة تتعلق بمشروعية إنشاء العبادة وهيئتها، بينما المسألة هنا تدور حول استصحاب طهارة معلومة.'
      }
    ]),
    difficulty: 'beginner'
  },
  {
    id: 'fp-102',
    fatwa_id: 'fatwa-102',
    principle_id: 'principle-tawqeef',
    explicitly_stated: true,
    application_explanation_ar: 'قرر الشيخ ابن عثيمين أن التقرب إلى الله بالأذكار بأعداد وصيغ لم يرد بها الشرع يعتبر بدعة، عملاً بقاعدة "الأصل في العبادات التوقيف والحظر"؛ فالعبادة لا تُحدث إلا بنص صريح.',
    distractor_principles_json: JSON.stringify([
      {
        id: 'principle-ibaha',
        canonical_text_ar: 'الأصل في الأشياء والمعاملات الإباحة',
        category: 'usuliyyah',
        reason_incorrect: 'الإباحة أصل في العادات والمعاملات الدنيوية، أما العبادات فالأصل فيها المنع حتى يرد النص.'
      },
      {
        id: 'principle-maqasid',
        canonical_text_ar: 'الأمور بمقاصدها',
        category: 'fiqhiyyah',
        reason_incorrect: 'النية الحسنة وحدها لا تصحح العبادة إذا كانت على خلاف السنة؛ فالشرط الثاني لصحة العمل هو الاتباع.'
      },
      {
        id: 'principle-adah',
        canonical_text_ar: 'العادة محكمة',
        category: 'fiqhiyyah',
        reason_incorrect: 'العرف لا ينشئ عبادة ولا يشرع صيغة دينية لم يأذن بها الشارع.'
      }
    ]),
    difficulty: 'intermediate'
  },
  {
    id: 'fp-103',
    fatwa_id: 'fatwa-103',
    principle_id: 'principle-dabit-riba',
    explicitly_stated: true,
    application_explanation_ar: 'طبّق الشيخ ابن عثيمين الضابط الفقهي الإجماعي "كل قرض جر نفعاً مشروطاً فهو ربا"، لأن تخفيض الأجرة منفعة مالية مشروطة في القرض أخرجته عن كونه عقد إرفاق إلى عقد معاوضة بفائدة.',
    distractor_principles_json: JSON.stringify([
      {
        id: 'principle-ibaha',
        canonical_text_ar: 'الأصل في المعاملات الإباحة والحل',
        category: 'usuliyyah',
        reason_incorrect: 'الإباحة مقيدة بعدم وقوع المعاملة في محظور شرعي قطعي كالربا أو الغرر.'
      },
      {
        id: 'principle-yaqeen',
        canonical_text_ar: 'اليقين لا يزول بالشك',
        category: 'fiqhiyyah',
        reason_incorrect: 'المسألة ليست مسألة شك في براءة ذمة أو دين، بل اشتراط شرط ربوي محرم.'
      },
      {
        id: 'principle-darar',
        canonical_text_ar: 'الضرر يزال',
        category: 'fiqhiyyah',
        reason_incorrect: 'القاعدة تعنى بإزالة الضرر والتعدي، والمنع هنا مبناه على صريح علة الربا في القروض.'
      }
    ]),
    difficulty: 'intermediate'
  },
  {
    id: 'fp-104',
    fatwa_id: 'fatwa-104',
    principle_id: 'principle-mashaqqah',
    explicitly_stated: true,
    application_explanation_ar: 'علل الشيخ ابن باز جواز التيمم وسقوط فرض استعمال الماء بقاعدة "المشقة تجلب التيسير" وقاعدة "الضرر يزال"، إذ إن تضرر الجروح مشقة غير معتادة أوجبت رخصة التيمم لدفع الضرر.',
    distractor_principles_json: JSON.stringify([
      {
        id: 'principle-tawqeef',
        canonical_text_ar: 'الأصل في العبادات التوقيف والحظر',
        category: 'usuliyyah',
        reason_incorrect: 'التيمم عبادة توقيفية ثبتت بالقرآن والسنة للمريض والمسافر، فلا تعارض.'
      },
      {
        id: 'principle-dabit-riba',
        canonical_text_ar: 'كل قرض جر نفعاً فهو ربا',
        category: 'dabit',
        reason_incorrect: 'ضابط مالي لا صلة له بباب الطهارة.'
      },
      {
        id: 'principle-adah',
        canonical_text_ar: 'العادة محكمة',
        category: 'fiqhiyyah',
        reason_incorrect: 'المرجع هنا إلى الدليل الشرعي وتقرير الأطباء لرفع الحرج، وليس للأعراف المجتمعية.'
      }
    ]),
    difficulty: 'beginner'
  },
  {
    id: 'fp-105',
    fatwa_id: 'fatwa-105',
    principle_id: 'principle-ibaha',
    explicitly_stated: true,
    application_explanation_ar: 'أصّل الشيخ ابن عثيمين حكم الأطعمة والملابس المستوردة الجديدة على قاعدة "الأصل في الأشياء والمعاملات الإباحة والحل"، حيث لا يجوز تحريم عين طاهرة نافعة إلا بنص شرعي قطعي.',
    distractor_principles_json: JSON.stringify([
      {
        id: 'principle-tawqeef',
        canonical_text_ar: 'الأصل في العبادات التوقيف والحظر',
        category: 'usuliyyah',
        reason_incorrect: 'خلط شائع؛ التوقيف خاص بالعبادات، أما الأطعمة والعادات فالأصل فيها الحل.'
      },
      {
        id: 'principle-yaqeen',
        canonical_text_ar: 'اليقين لا يزول بالشك',
        category: 'fiqhiyyah',
        reason_incorrect: 'تفيد استصحاب الطهارة، لكن الحكم الإنشائي بالحل مبناه على الأصل العام للأعيان.'
      },
      {
        id: 'principle-maqasid',
        canonical_text_ar: 'الأمور بمقاصدها',
        category: 'fiqhiyyah',
        reason_incorrect: 'النية تؤثر في ثواب تناول المباح، لكن أصل حل الطعام مقرر شرعاً بذاته.'
      }
    ]),
    difficulty: 'advanced'
  }
];

export const INITIAL_USER_STATE = {
  bookmarks: ['fatwa-101'],
  history: [
    {
      id: 'hist-1',
      fatwa_id: 'fatwa-101',
      principle_id: 'principle-yaqeen',
      selected_principle_id: 'principle-yaqeen',
      is_correct: true,
      timestamp: Date.now() - 3600000 * 5,
      time_spent_ms: 4200,
      difficulty: 'beginner' as const
    }
  ],
  spaced_repetition: {
    'principle-yaqeen': {
      principle_id: 'principle-yaqeen',
      level: 2,
      streak: 2,
      last_reviewed: Date.now() - 3600000 * 5,
      next_review: Date.now() + 86400000 * 3,
      correct_count: 2,
      total_attempts: 2
    }
  },
  xp: 120,
  streak_days: 3
};
