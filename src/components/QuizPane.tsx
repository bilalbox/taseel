import { ArrowLeft, Flag, Shuffle } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useLearnerProgress } from "../hooks/useLearnerProgress";
import type {
	DistractorItem,
	Fatwa,
	FatwaPrinciple,
	Principle,
	QuizQuestionMode,
} from "../types";
import { CATEGORY_LABELS } from "../utils/arabic";
import { FeedbackModal } from "./FeedbackModal";

export interface QuizPaneProps {
	fatwa?: Fatwa;
	principle?: Principle;
	fatwaPrinciple?: FatwaPrinciple;
	isAnswered?: boolean;
	lastAttempt?: { isCorrect: boolean; selectedId: string; timestamp: number };
	totalGroundedCount?: number;
	answeredCount?: number;
	onNextQuestion?: () => void;
}

/** Remount key so local reveal state clears when the active question changes. */
export function quizPaneRemountKey(
	fatwaId: string | undefined,
	principleId: string | undefined,
): string {
	return `${fatwaId ?? ""}:${principleId ?? ""}`;
}

function QuestionModeBadge({ mode }: { mode?: QuizQuestionMode }) {
	if (mode === "compound_hierarchy") {
		return (
			<span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
				هرمية القواعد
			</span>
		);
	}
	if (mode === "usul_foundation") {
		return (
			<span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
				الأصل الأصولي
			</span>
		);
	}
	return null;
}

export const QuizPane: React.FC<QuizPaneProps> = ({
	fatwa: propFatwa,
	principle: propPrinciple,
	fatwaPrinciple: propFatwaPrinciple,
	isAnswered: propIsAnswered,
	lastAttempt: propLastAttempt,
	totalGroundedCount: propTotalGroundedCount,
	answeredCount: propAnsweredCount,
	onNextQuestion: propOnNextQuestion,
}) => {
	const learner = useLearnerProgress();
	const currentQ = learner.currentQuestion;

	const fatwa = propFatwa !== undefined ? propFatwa : currentQ?.fatwa;
	const principle =
		propPrinciple !== undefined ? propPrinciple : currentQ?.principle;
	const fatwaPrinciple =
		propFatwaPrinciple !== undefined
			? propFatwaPrinciple
			: currentQ?.fatwaPrinciple;
	const isAnswered =
		propIsAnswered !== undefined
			? propIsAnswered
			: (currentQ?.isAnswered ?? false);
	const lastAttempt =
		propLastAttempt !== undefined ? propLastAttempt : currentQ?.lastAttempt;
	const totalGroundedCount =
		propTotalGroundedCount !== undefined
			? propTotalGroundedCount
			: learner.stats.totalGroundedCount;
	const answeredCount =
		propAnsweredCount !== undefined
			? propAnsweredCount
			: learner.stats.answeredCount;
	const handleNextQuestion =
		propOnNextQuestion || (() => learner.nextQuestion());
	const _handleResetProgress = () => learner.resetProgress();

	const [selectedQuizChoice, setSelectedQuizChoice] = useState<string | null>(
		null,
	);
	const [hasSubmittedQuiz, setHasSubmittedQuiz] = useState(false);
	const [quizStartTime, setQuizStartTime] = useState(() => Date.now());
	const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

	// Local reveal state resets via remount when AppShell changes the pane `key`
	// (fatwa id + principle id). Avoid a deps-only useEffect for that reset:
	// Biome useExhaustiveDependencies + --write strips unused ids and leaves
	// hasSubmittedQuiz stuck after "next question".

	const distractors: DistractorItem[] = useMemo(() => {
		if (!fatwaPrinciple) return [];
		try {
			return JSON.parse(fatwaPrinciple.distractor_principles_json);
		} catch {
			return [];
		}
	}, [fatwaPrinciple]);

	const quizChoices = useMemo(() => {
		if (
			currentQ?.quizItem?.choices &&
			currentQ.quizItem.choices.length > 0 &&
			currentQ.quizItem.fatwa.id === fatwa?.id
		) {
			return currentQ.quizItem.choices.map((c) => ({
				id: c.id,
				text: c.text,
				category: c.category,
				is_correct: c.is_correct,
				reason: c.explanation || "",
			}));
		}

		if (!principle || !fatwaPrinciple) return [];
		const all = [
			{
				id: principle.id,
				text: principle.canonical_text_ar,
				category: principle.category,
				is_correct: true,
				reason: fatwaPrinciple.application_explanation_ar,
			},
			...distractors.map((d) => ({
				id: d.id,
				text: d.canonical_text_ar,
				category: d.category,
				is_correct: false,
				reason: d.reason_incorrect,
			})),
		];
		return all.sort((a, b) => a.text.localeCompare(b.text, "ar"));
	}, [currentQ?.quizItem, fatwa?.id, principle, distractors, fatwaPrinciple]);

	const handleChoiceSelect = (choiceId: string) => {
		if (hasSubmittedQuiz) return;
		setSelectedQuizChoice(choiceId);
	};

	const handleSubmit = () => {
		if (hasSubmittedQuiz || !selectedQuizChoice || !fatwa || !principle) return;
		setHasSubmittedQuiz(true);
		const duration = Date.now() - quizStartTime;
		learner.recordAttempt(selectedQuizChoice, duration);
	};

	const handleRetry = () => {
		setSelectedQuizChoice(null);
		setHasSubmittedQuiz(false);
		setQuizStartTime(Date.now());
	};

	if (!principle || !fatwaPrinciple) {
		return (
			<div className="bg-page-raised border border-page-line rounded-lg p-6 text-center text-ink-muted text-sm animate-fade-pane space-y-3">
				<p>لا توجد قاعدة مربوطة بهذه الفتوى للاختبار بعد</p>
				{handleNextQuestion && (
					<button
						type="button"
						onClick={handleNextQuestion}
						className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-white rounded-md text-xs font-semibold hover:bg-accent-mid transition"
					>
						<Shuffle className="w-3.5 h-3.5" />
						<span>عرض سؤال عشوائي</span>
					</button>
				)}
			</div>
		);
	}

	const difficultyLabel =
		fatwaPrinciple.difficulty === "beginner"
			? "مبتدئ"
			: fatwaPrinciple.difficulty === "intermediate"
				? "متوسط"
				: "متقدم";

	return (
		<div className="bg-page-raised border border-page-line rounded-xl p-5 sm:p-6 space-y-4 animate-fade-pane">
			<div className="flex items-center justify-between gap-3 pb-3 border-b border-page-line flex-wrap">
				<div className="flex items-center gap-2">
					<span className="text-xs font-semibold text-ink">
						سؤال في التخريج
					</span>
					<QuestionModeBadge mode={currentQ?.quizItem?.question_mode} />
					{totalGroundedCount > 0 && (
						<span className="text-[11px] text-ink-faint">
							({answeredCount} من {totalGroundedCount} مُجاب)
						</span>
					)}
					{isAnswered && (
						<span
							className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
								lastAttempt?.isCorrect
									? "text-emerald-700 bg-emerald-50"
									: "text-amber-700 bg-amber-50"
							}`}
						>
							{lastAttempt?.isCorrect ? "✓ صواب" : "سابق"}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => setIsFeedbackOpen(true)}
						title="إبلاغ عن خطأ في السؤال أو التخريج أو الخيارات"
						className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-ink-muted hover:text-amber-700 hover:bg-amber-500/10 transition"
					>
						<Flag className="w-3.5 h-3.5 text-amber-600" />
						<span className="hidden sm:inline">إبلاغ</span>
					</button>
					{handleNextQuestion && (
						<button
							type="button"
							onClick={handleNextQuestion}
							title="الانتقال إلى سؤال عشوائي آخر"
							className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-page-line bg-page hover:bg-page-sunken text-ink-muted hover:text-ink transition"
						>
							<Shuffle className="w-3.5 h-3.5 text-accent" />
							<span>سؤال آخر</span>
						</button>
					)}
				</div>
			</div>

			<h2 className="font-semibold text-sm sm:text-base text-ink leading-snug">
				{currentQ?.quizItem?.question_title_ar ||
					"ما القاعدة التي بُني عليها الحكم في هذه الفتوى؟"}
			</h2>

			<div className="space-y-2">
				{quizChoices.map((choice) => {
					const isSelected = selectedQuizChoice === choice.id;
					let btnStyle =
						"bg-page border-page-line text-ink hover:border-accent/40 hover:bg-accent-soft/40";

					if (hasSubmittedQuiz) {
						if (choice.is_correct) {
							btnStyle =
								"bg-accent-soft border-accent/40 text-accent-deep font-semibold";
						} else if (isSelected && !choice.is_correct) {
							btnStyle = "bg-rose-50 border-rose-200 text-rose-950";
						} else {
							btnStyle =
								"opacity-50 bg-page-sunken border-page-line text-ink-muted";
						}
					} else if (isSelected) {
						btnStyle =
							"bg-accent-soft/50 border-accent/40 text-ink ring-1 ring-accent/30";
					}

					return (
						<div key={choice.id} className="space-y-1">
							<button
								type="button"
								onClick={() => handleChoiceSelect(choice.id)}
								disabled={hasSubmittedQuiz}
								aria-pressed={isSelected}
								className={`w-full text-right p-2.5 rounded-md text-sm border transition ${btnStyle}`}
							>
								<span className="font-amiri text-[15px] block">
									{choice.text}
								</span>
							</button>

							{hasSubmittedQuiz && (isSelected || choice.is_correct) && (
								<div
									className={`p-2 rounded-md text-[12px] leading-relaxed animate-reveal-answer overflow-hidden ${
										choice.is_correct
											? "bg-accent-soft text-accent-deep"
											: "bg-rose-50 text-rose-900"
									}`}
								>
									<strong>
										{choice.is_correct ? "صواب: " : "وجه الخطأ: "}
									</strong>
									{choice.reason}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{!hasSubmittedQuiz && (
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!selectedQuizChoice}
					className="w-full px-3 py-2.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-mid disabled:opacity-40 disabled:hover:bg-accent transition"
				>
					تأكيد الإجابة
				</button>
			)}

			{hasSubmittedQuiz && (
				<div className="pt-4 border-t border-page-line space-y-4 animate-fade-pane">
					<div className="flex items-center justify-between gap-2 text-xs">
						<span className="font-semibold text-accent">
							{CATEGORY_LABELS[principle.category]?.badge}
						</span>
						<span className="text-[11px] text-ink-faint">
							{difficultyLabel}
						</span>
					</div>

					<h3 className="font-amiri text-xl font-bold text-ink leading-snug">
						«{principle.canonical_text_ar}»
					</h3>

					<div className="space-y-3 text-sm leading-relaxed text-ink-soft">
						<p className="font-amiri text-[15px] leading-relaxed">
							{principle.general_explanation_ar}
						</p>

						<div className="pt-3 border-t border-page-line/60 space-y-1.5">
							<p className="font-amiri text-[15px] text-accent-deep font-medium leading-relaxed">
								{fatwaPrinciple.application_explanation_ar}
							</p>
							<div className="flex items-center justify-between text-[11px] text-ink-faint pt-1">
								<span>
									{fatwaPrinciple.explicitly_stated
										? "مصرّح بها في كلام الشيخ"
										: "مستنبطة من تعليل الحكم"}
								</span>
								<button
									type="button"
									onClick={() => setIsFeedbackOpen(true)}
									className="text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1"
								>
									<Flag className="w-3 h-3 text-amber-600" />
									<span>ملاحظة على هذا التخريج؟</span>
								</button>
							</div>
						</div>
					</div>

					<div className="flex items-center justify-between gap-3 pt-3 border-t border-page-line flex-wrap">
						<button
							type="button"
							onClick={handleRetry}
							className="text-xs text-ink-muted hover:text-ink transition underline-offset-4 hover:underline"
						>
							إعادة المحاولة
						</button>
						{handleNextQuestion && (
							<button
								type="button"
								onClick={handleNextQuestion}
								className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-white font-semibold rounded-lg text-sm hover:bg-accent-mid shadow-sm transition"
							>
								<span>السؤال التالي</span>
								<ArrowLeft className="w-4 h-4" />
							</button>
						)}
					</div>
				</div>
			)}

			<FeedbackModal
				isOpen={isFeedbackOpen}
				onClose={() => setIsFeedbackOpen(false)}
				fatwa={fatwa}
				principle={principle}
				fatwaPrinciple={fatwaPrinciple}
				quizChoices={quizChoices}
				selectedChoiceId={selectedQuizChoice}
			/>
		</div>
	);
};
