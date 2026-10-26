export type Scholar = 'ابن باز' | 'ابن عثيمين';
export type TopicDomain = 'Fiqh' | 'Aqidah' | 'Usul' | 'Tafsir' | 'Hadith' | 'Adab';
export type PrincipleCategory = 'fiqhiyyah' | 'usuliyyah' | 'dabit';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Episode {
  id: string;
  scholar_name: Scholar;
  episode_number: number;
  source_url: string;
  /** Per-clip/episode MP3; omit when no known host (e.g. Uthaymeen text corpus). */
  audio_url?: string;
}

export interface Fatwa {
  id: string;
  episode_id: string;
  question_text: string;
  answer_text: string;
  question_norm: string;
  answer_norm: string;
  topic_domain: TopicDomain;
  topic_chapter: string;
  topic_subtopic: string;
  scholar_name: Scholar;
  episode_number: number;
  audio_url?: string;
  audio_timestamp?: number;
}

export interface Principle {
  id: string;
  canonical_text_ar: string;
  canonical_text_norm: string;
  category: PrincipleCategory;
  general_explanation_ar: string;
  english_transliteration?: string;
  parent_id?: string | null;
  depth?: number;
  science?: string;
  kind?: string;
  domain_section?: string;
}

export interface PrincipleTreeNode extends Principle {
  fatwas_count: number;
  children: PrincipleTreeNode[];
}

export interface BrowseFatwasParams {
  query?: string;
  scholar?: Scholar | 'ALL';
  chapter?: string | 'ALL';
  subtopic?: string;
  principleId?: string;
  limit?: number;
  offset?: number;
}

export interface FatwaSummary {
  id: string;
  episode_id: string;
  scholar_name: Scholar;
  episode_number: number;
  question_text: string;
  topic_domain: TopicDomain;
  topic_chapter: string;
  topic_subtopic: string;
  audio_url?: string;
  audio_timestamp?: number;
  linked_principles_count?: number;
}

export interface BrowseFatwasResult {
  fatwas: FatwaSummary[];
  total: number;
  hasMore: boolean;
  latencyMs?: number;
}

export interface FatwaDetail extends Fatwa {
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  fatwa: Fatwa;
}

export interface ArchiveQueryAdapter {
  getPrinciplesTree(): Promise<PrincipleTreeNode[]>;
  browseFatwas(params?: BrowseFatwasParams): Promise<BrowseFatwasResult>;
  getFatwaDetail(id: string): Promise<FatwaDetail | null>;
}

export type AppMode = 'quiz' | 'browse';
export type BrowseTab = 'principles' | 'chapters';

export interface DistractorItem {
  id: string;
  canonical_text_ar: string;
  category: PrincipleCategory;
  reason_incorrect: string;
}

export interface FatwaPrinciple {
  id: string;
  fatwa_id: string;
  principle_id: string;
  explicitly_stated: boolean;
  application_explanation_ar: string;
  distractor_principles_json: string; // JSON string of DistractorItem[]
  difficulty: Difficulty;
}

export interface QuizQuestionItem {
  fatwa: Fatwa;
  correct_principle: Principle;
  fatwa_principle: FatwaPrinciple;
  choices: {
    id: string;
    text: string;
    category: PrincipleCategory;
    is_correct: boolean;
    explanation?: string;
  }[];
}

export interface UserQuizHistoryItem {
  id: string;
  fatwa_id: string;
  principle_id: string;
  selected_principle_id: string;
  is_correct: boolean;
  timestamp: number;
  time_spent_ms: number;
  difficulty: Difficulty;
}

export interface SpacedRepetitionRecord {
  principle_id: string;
  level: number;
  streak: number;
  last_reviewed: number;
  next_review: number;
  correct_count: number;
  total_attempts: number;
}

export interface UserState {
  bookmarks: string[]; // fatwa_ids
  history: UserQuizHistoryItem[];
  spaced_repetition: Record<string, SpacedRepetitionRecord>;
  xp: number;
  streak_days: number;
}

export type FeedbackReason =
  | 'wrong_principle'
  | 'wrong_explanation'
  | 'clerical_error'
  | 'no_correct_option';

export interface FeedbackSubmission {
  fatwa_id: string;
  scholar_name?: string;
  topic_chapter?: string;
  topic_subtopic?: string;
  question_excerpt?: string;
  principle_id?: string;
  principle_text?: string;
  reason: FeedbackReason;
  user_comment?: string;
  options_shown?: { id: string; text: string; is_correct?: boolean }[];
  user_selected_id?: string | null;
  turnstile_token: string;
}

export interface FeedbackRecord extends Omit<FeedbackSubmission, 'turnstile_token'> {
  id: string;
  status: 'open' | 'reviewed' | 'resolved' | 'dismissed';
  created_at: string;
  ip_country?: string;
  user_agent?: string;
  resolution_notes?: string;
  reviewed_at?: string;
}
