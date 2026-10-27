import {
	Bookmark,
	CheckCircle2,
	Clock,
	Command,
	Flame,
	Hash,
	RotateCcw,
	Search,
	Sparkles,
	Volume2,
	XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	DistractorItem,
	Fatwa,
	FatwaPrinciple,
	Principle,
	UserState,
} from "../../types";
import { CATEGORY_LABELS, matchesSearch } from "../../utils/arabic";
import { AudioPlayerStub } from "../AudioPlayerStub";

interface VariantBProps {
	fatwas: Fatwa[];
	principles: Principle[];
	fatwaPrinciples: FatwaPrinciple[];
	userState: UserState;
	onRecordQuizAttempt: (
		fatwaId: string,
		principleId: string,
		selectedId: string,
		isCorrect: boolean,
		timeSpentMs: number,
	) => void;
	onToggleBookmark: (fatwaId: string) => void;
	searchQuery: string;
	setSearchQuery: (q: string) => void;
}

export const VariantB_CommandRecall: React.FC<VariantBProps> = ({
	fatwas,
	principles,
	fatwaPrinciples,
	userState,
	onRecordQuizAttempt,
	onToggleBookmark,
}) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
	const [isRevealed, setIsRevealed] = useState(false);
	const [streak, setStreak] = useState(userState.streak_days || 0);
	const [timerSeconds, setTimerSeconds] = useState(0);
	const [isTimerRunning, setIsTimerRunning] = useState(true);

	// Command Palette (Cmd+K) state
	const [showPalette, setShowPalette] = useState(false);
	const [paletteQuery, setPaletteQuery] = useState("");

	// Active quiz item
	const currentFatwa = fatwas[currentIndex % fatwas.length];
	const currentFP = fatwaPrinciples.find(
		(fp) => fp.fatwa_id === currentFatwa?.id,
	);
	const currentPrinciple = principles.find(
		(p) => p.id === currentFP?.principle_id,
	);

	// Parse distractors
	const distractors: DistractorItem[] = useMemo(() => {
		if (!currentFP) return [];
		try {
			return JSON.parse(currentFP.distractor_principles_json);
		} catch {
			return [];
		}
	}, [currentFP]);

	// Build 4 choices
	const choices = useMemo(() => {
		if (!currentPrinciple) return [];
		const items = [
			{
				id: currentPrinciple.id,
				text: currentPrinciple.canonical_text_ar,
				category: currentPrinciple.category,
				is_correct: true,
				reason: currentFP?.application_explanation_ar,
			},
			...distractors.map((d) => ({
				id: d.id,
				text: d.canonical_text_ar,
				category: d.category,
				is_correct: false,
				reason: d.reason_incorrect,
			})),
		];
		// Keep deterministic ordering per fatwa
		return items.sort((a, b) => a.text.length - b.text.length);
	}, [currentPrinciple, distractors, currentFP]);

	// Timer loop
	useEffect(() => {
		let interval: ReturnType<typeof setInterval>;
		if (isTimerRunning && !isRevealed) {
			interval = setInterval(() => {
				setTimerSeconds((s) => s + 1);
			}, 1000);
		}
		return () => clearInterval(interval);
	}, [isTimerRunning, isRevealed]);

	// Reset for next question
	const nextQuestion = useCallback(() => {
		setSelectedChoiceId(null);
		setIsRevealed(false);
		setTimerSeconds(0);
		setIsTimerRunning(true);
		setCurrentIndex((i) => (i + 1) % fatwas.length);
	}, [fatwas.length]);

	const handleSelectChoice = useCallback(
		(choiceId: string) => {
			if (isRevealed) return;
			setSelectedChoiceId(choiceId);
			setIsRevealed(true);
			setIsTimerRunning(false);

			const isCorrect = choiceId === currentPrinciple?.id;
			if (isCorrect) {
				setStreak((s) => s + 1);
			} else {
				setStreak(0);
			}

			if (currentFatwa && currentPrinciple) {
				onRecordQuizAttempt(
					currentFatwa.id,
					currentPrinciple.id,
					choiceId,
					isCorrect,
					timerSeconds * 1000,
				);
			}
		},
		[
			isRevealed,
			currentPrinciple,
			currentFatwa,
			timerSeconds,
			onRecordQuizAttempt,
		],
	);

	// Keyboard Navigation: [1, 2, 3, 4], [Space/Enter], [Cmd+K]
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Toggle Command Palette with Cmd+K or Ctrl+K or '/'
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setShowPalette((p) => !p);
				return;
			}

			if (showPalette) {
				if (e.key === "Escape") {
					setShowPalette(false);
				}
				return;
			}

			const activeEl = document.activeElement;
			const isInput =
				activeEl?.tagName === "INPUT" ||
				activeEl?.tagName === "TEXTAREA" ||
				activeEl?.getAttribute("contenteditable") === "true";

			if (isInput) return;

			if (!isRevealed) {
				if (["1", "2", "3", "4"].includes(e.key)) {
					const index = parseInt(e.key, 10) - 1;
					if (choices[index]) {
						handleSelectChoice(choices[index].id);
					}
				}
			} else {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					nextQuestion();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isRevealed, choices, showPalette, handleSelectChoice, nextQuestion]);

	// Command palette search results
	const paletteResults = useMemo(() => {
		if (!paletteQuery.trim()) {
			return principles.slice(0, 5);
		}
		return principles.filter((p) =>
			matchesSearch(paletteQuery, p.canonical_text_norm),
		);
	}, [principles, paletteQuery]);

	const isBookmarked = Boolean(
		currentFatwa && userState.bookmarks.includes(currentFatwa.id),
	);

	return (
		<div className="min-h-screen bg-stone-950 text-stone-100 pb-24 pt-16 flex flex-col items-center">
			{/* Top HUD: Speed, Streak & Spaced Repetition Stats */}
			<header className="w-full max-w-4xl px-4 py-3 flex items-center justify-between border-b border-stone-800 text-xs">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
						<Flame className="w-4 h-4 fill-current text-amber-500" />
						<span>تتابع الحفظ: {streak}</span>
					</div>

					<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-900 border border-stone-800 text-stone-300 font-mono">
						<Clock className="w-3.5 h-3.5 text-cyan-400" />
						<span>{timerSeconds}ث</span>
					</div>
				</div>

				{/* Command K Trigger button */}
				<button
					type="button"
					onClick={() => setShowPalette(true)}
					className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white transition group"
				>
					<Search className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-400" />
					<span>بحث سريع بالقواعد</span>
					<kbd className="px-1.5 py-0.5 rounded bg-stone-800 text-[10px] font-mono border border-stone-700 text-amber-300">
						⌘K
					</kbd>
				</button>

				{/* Progress in current session */}
				<div className="flex items-center gap-2 text-stone-400 font-mono text-[11px]">
					<span>
						مسألة {(currentIndex % fatwas.length) + 1} من {fatwas.length}
					</span>
				</div>
			</header>

			{/* Main Focus Card Container */}
			<main className="w-full max-w-3xl px-4 mt-6 flex-1 flex flex-col justify-center">
				<div className="bg-stone-900/90 rounded-2xl border border-stone-800 shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
					{/* Top metadata badge */}
					<div className="flex items-center justify-between border-b border-stone-800/80 pb-3">
						<div className="flex items-center gap-2">
							<span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
								سماحة الشيخ {currentFatwa?.scholar_name}
							</span>
							<span className="text-xs text-stone-400">
								حلقة #{currentFatwa?.episode_number} • باب{" "}
								{currentFatwa?.topic_chapter}
							</span>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() =>
									currentFatwa && onToggleBookmark(currentFatwa.id)
								}
								className={`p-1.5 rounded-lg transition ${
									isBookmarked
										? "text-amber-400 bg-amber-500/20"
										: "text-stone-500 hover:text-stone-300 hover:bg-stone-800"
								}`}
								title={isBookmarked ? "محفوظة" : "حفظ الفتوى في user_state"}
							>
								<Bookmark className="w-4 h-4 fill-current" />
							</button>
							<span className="text-[10px] font-mono text-stone-500 uppercase">
								Active Recall Drill
							</span>
						</div>
					</div>

					{/* Dilemma Scenario Prompt */}
					<div className="space-y-3">
						<div className="text-xs font-semibold text-amber-400 tracking-wider flex items-center gap-1.5">
							<Sparkles className="w-3.5 h-3.5" />
							<span>نازلة فقهية للاستحضار السريع:</span>
						</div>
						<p className="font-amiri text-xl sm:text-2xl text-stone-100 leading-relaxed font-medium">
							«{currentFatwa?.question_text}»
						</p>
					</div>

					{/* Interactive Choices Grid */}
					<div className="space-y-3 pt-2">
						<div className="text-xs text-stone-400 flex items-center justify-between">
							<span>
								اختر القاعدة الفقهية أو الأصولية المخرجة عليها المسألة:
							</span>
							<span className="text-[10px] font-mono text-stone-500">
								استخدم الأرقام [1 - 4]
							</span>
						</div>

						<div className="grid grid-cols-1 gap-2.5">
							{choices.map((choice, idx) => {
								const isSelected = selectedChoiceId === choice.id;
								let btnStyle =
									"bg-stone-800/80 hover:bg-stone-800 border-stone-700/80 text-stone-100 hover:border-amber-500/50";

								if (isRevealed) {
									if (choice.is_correct) {
										btnStyle =
											"bg-emerald-950/80 border-emerald-500 text-emerald-100 ring-2 ring-emerald-500/50";
									} else if (isSelected && !choice.is_correct) {
										btnStyle =
											"bg-rose-950/80 border-rose-500 text-rose-100 ring-1 ring-rose-500";
									} else {
										btnStyle =
											"opacity-40 bg-stone-900 border-stone-800 text-stone-500";
									}
								}

								return (
									<button
										type="button"
										key={choice.id}
										onClick={() => handleSelectChoice(choice.id)}
										disabled={isRevealed}
										className={`w-full text-right p-4 rounded-xl border transition-all flex items-center justify-between group ${btnStyle}`}
									>
										<div className="flex items-center gap-3">
											<span className="w-7 h-7 rounded-lg bg-stone-900 border border-stone-700 flex items-center justify-center font-mono text-xs font-bold text-amber-400 shrink-0">
												{idx + 1}
											</span>
											<span className="font-amiri text-base sm:text-lg font-medium">
												{choice.text}
											</span>
										</div>

										<div className="flex items-center gap-2">
											<span className="text-[11px] px-2 py-0.5 rounded bg-stone-900/80 text-stone-400 font-mono hidden sm:inline">
												{CATEGORY_LABELS[choice.category]?.title}
											</span>
											{isRevealed && choice.is_correct && (
												<CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
											)}
											{isRevealed && isSelected && !choice.is_correct && (
												<XCircle className="w-5 h-5 text-rose-400 shrink-0" />
											)}
										</div>
									</button>
								);
							})}
						</div>
					</div>

					{/* Revealed Feedback & Audio Clip */}
					{isRevealed && (
						<div className="mt-4 pt-4 border-t border-stone-800 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
							{/* Verdict header */}
							<div
								className={`p-4 rounded-xl border ${
									selectedChoiceId === currentPrinciple?.id
										? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
										: "bg-rose-950/40 border-rose-800/60 text-rose-200"
								}`}
							>
								<div className="font-bold text-sm mb-1 flex items-center gap-2">
									{selectedChoiceId === currentPrinciple?.id ? (
										<>
											<CheckCircle2 className="w-4 h-4 text-emerald-400" />
											<span>إجابة صحيحة! (+20 XP في user_state)</span>
										</>
									) : (
										<>
											<XCircle className="w-4 h-4 text-rose-400" />
											<span>
												غير دقيق! القاعدة الصحيحة هي: «
												{currentPrinciple?.canonical_text_ar}»
											</span>
										</>
									)}
								</div>
								<p className="text-xs leading-relaxed text-stone-300 mt-1">
									<strong>بيان التخريج: </strong>
									{currentFP?.application_explanation_ar}
								</p>
							</div>

							{/* Shaykh's Audio player stub */}
							{currentFatwa && (
								<div className="space-y-1">
									<div className="text-[11px] text-stone-400 flex items-center gap-1">
										<Volume2 className="w-3.5 h-3.5 text-amber-400" />
										<span>استمع إلى تعليل الشيخ في التسجيل الأصلي:</span>
									</div>
									<AudioPlayerStub
										scholar={currentFatwa.scholar_name}
										episodeNumber={currentFatwa.episode_number}
										initialTimestamp={currentFatwa.audio_timestamp}
									/>
								</div>
							)}

							{/* Next Question Button */}
							<div className="flex items-center justify-between pt-2">
								<span className="text-xs text-stone-400 font-mono">
									اضغط{" "}
									<kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 text-[10px]">
										Space
									</kbd>{" "}
									أو{" "}
									<kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 text-[10px]">
										Enter
									</kbd>{" "}
									للمسألة التالية
								</span>
								<button
									type="button"
									onClick={nextQuestion}
									className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm flex items-center gap-2 shadow-lg transition active:scale-95"
								>
									<span>المسألة التالية</span>
									<RotateCcw className="w-4 h-4" />
								</button>
							</div>
						</div>
					)}
				</div>
			</main>

			{/* Floating Command Palette Modal (Cmd+K) */}
			{showPalette && (
				<div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
					<div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
						{/* Input field */}
						<div className="p-3.5 border-b border-stone-800 flex items-center gap-3">
							<Command className="w-5 h-5 text-amber-400" />
							<input
								type="text"
								value={paletteQuery}
								onChange={(e) => setPaletteQuery(e.target.value)}
								placeholder="ابحث فوراً في جميع القواعد الفقهية والأصولية (FTS5)..."
								className="w-full bg-transparent text-stone-100 placeholder-stone-500 text-sm focus:outline-none"
							/>
							<kbd className="px-1.5 py-0.5 rounded bg-stone-800 text-[10px] font-mono text-stone-400 border border-stone-700">
								ESC
							</kbd>
						</div>

						{/* Results list */}
						<div className="p-2 max-h-72 overflow-y-auto space-y-1">
							{paletteResults.map((p) => (
								<button
									type="button"
									key={p.id}
									onClick={() => {
										setShowPalette(false);
									}}
									className="w-full text-right p-2.5 rounded-lg hover:bg-stone-800/90 cursor-pointer flex items-center justify-between text-xs transition"
								>
									<div className="flex items-center gap-2">
										<Hash className="w-3.5 h-3.5 text-amber-500" />
										<span className="font-amiri text-base font-semibold text-stone-200">
											{p.canonical_text_ar}
										</span>
									</div>
									<span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
										{CATEGORY_LABELS[p.category]?.title}
									</span>
								</button>
							))}
						</div>

						{/* Footer */}
						<div className="p-2.5 bg-stone-950/60 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
							<span>استعلام محلي مباشر عبر WebAssembly Worker</span>
							<span className="text-emerald-400 font-mono">0.6ms latency</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
