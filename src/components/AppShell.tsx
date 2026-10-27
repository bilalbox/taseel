import {
	BookmarkCheck,
	CheckCircle2,
	Filter,
	Layers,
	Search,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toFatwaSummary } from "../data/mockArchiveAdapter";
import { useLearnerProgress } from "../hooks/useLearnerProgress";
import { sqliteClient } from "../services/sqliteClient";
import type {
	AppMode,
	Fatwa,
	FatwaDetail,
	FatwaPrinciple,
	FatwaSummary,
	Principle,
	Scholar,
} from "../types";
import { chapterLabelAr } from "../utils/arabic";
import { BrowseIndex } from "./BrowseIndex";
import { FatwaReader } from "./FatwaReader";
import { QuizPane } from "./QuizPane";

export interface AppShellProps {
	fatwas: Fatwa[];
	principles: Principle[];
	fatwaPrinciples: FatwaPrinciple[];
	searchQuery: string;
	setSearchQuery: (q: string) => void;
	onSearchLatency?: (latencyMs: number) => void;
	bootLabel?: string | null;
	opfsReady: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
	fatwas,
	principles,
	fatwaPrinciples,
	searchQuery,
	setSearchQuery,
	onSearchLatency,
	bootLabel,
	opfsReady,
}) => {
	const learner = useLearnerProgress();
	const [mode, setMode] = useState<AppMode>("quiz");
	const [selectedScholar, setSelectedScholar] = useState<Scholar | "ALL">(
		"ALL",
	);
	const [selectedChapter, setSelectedChapter] = useState<string>("ALL");
	const [filterUnansweredOnly, setFilterUnansweredOnly] = useState(false);
	const [showSidebarInQuiz, setShowSidebarInQuiz] = useState(false);

	// Parse optional ?fatwa= query parameter from URL
	const requestedFatwaId = useMemo(() => {
		if (typeof window === "undefined") return null;
		return new URLSearchParams(window.location.search).get("fatwa");
	}, []);

	const [activeFatwaId, setActiveFatwaId] = useState<string>(() => {
		if (requestedFatwaId && fatwas.some((f) => f.id === requestedFatwaId)) {
			return requestedFatwaId;
		}
		return learner.currentQuestion?.fatwa.id || fatwas[0]?.id || "";
	});

	const [activePrincipleId, setActivePrincipleId] = useState<string | null>(
		() => {
			return learner.currentQuestion?.principle.id || null;
		},
	);

	// Synchronize with URL parameter or learner store's initial selection
	useEffect(() => {
		if (requestedFatwaId && fatwas.some((f) => f.id === requestedFatwaId)) {
			setActiveFatwaId(requestedFatwaId);
			learner.selectQuestion(requestedFatwaId);
		}
	}, [requestedFatwaId, fatwas, learner]);

	// Synchronize when store's current question changes
	useEffect(() => {
		if (learner.currentQuestion) {
			setActiveFatwaId(learner.currentQuestion.fatwa.id);
			setActivePrincipleId(learner.currentQuestion.principle.id);
		}
	}, [learner.currentQuestion]);

	const [chapters, setChapters] = useState<string[]>(() =>
		Array.from(
			new Set(fatwas.map((f) => f.topic_chapter).filter(Boolean)),
		).sort(),
	);

	useEffect(() => {
		let cancelled = false;
		sqliteClient
			.getArchiveChapters()
			.then((chs) => {
				if (!cancelled && chs && chs.length > 0) {
					setChapters(chs);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const [browsedFatwas, setBrowsedFatwas] = useState<FatwaSummary[]>(() =>
		fatwas.map((f) => toFatwaSummary(f, fatwaPrinciples)),
	);
	const [browseTotal, setBrowseTotal] = useState<number>(() => fatwas.length);

	useEffect(() => {
		let cancelled = false;
		sqliteClient
			.browseFatwas({
				scholar: selectedScholar,
				chapter: selectedChapter,
				query: searchQuery,
				limit: 80,
			})
			.then((res) => {
				if (!cancelled) {
					setBrowsedFatwas(res.fatwas);
					setBrowseTotal(res.total);
					if (typeof res.latencyMs === "number") {
						onSearchLatency?.(res.latencyMs);
					}
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [selectedScholar, selectedChapter, searchQuery, onSearchLatency]);

	const [activeDetail, setActiveDetail] = useState<FatwaDetail | null>(null);

	useEffect(() => {
		if (!activeFatwaId) return;
		let cancelled = false;
		sqliteClient
			.getFatwaDetail(activeFatwaId)
			.then((detail) => {
				if (!cancelled && detail) {
					setActiveDetail(detail);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [activeFatwaId]);

	const displayFatwas = useMemo(() => {
		if (filterUnansweredOnly) {
			return browsedFatwas.filter((f) => !learner.isQuestionAnswered(f.id));
		}
		return browsedFatwas;
	}, [browsedFatwas, filterUnansweredOnly, learner]);

	const activeFatwa =
		activeDetail ||
		fatwas.find((f) => f.id === activeFatwaId) ||
		(displayFatwas[0] as Fatwa | undefined) ||
		fatwas[0];

	const currentFatwaPrinciples = useMemo(() => {
		if (
			activeDetail?.fatwaPrinciples &&
			activeDetail.fatwaPrinciples.length > 0
		) {
			return activeDetail.fatwaPrinciples;
		}
		return fatwaPrinciples.filter((fp) => fp.fatwa_id === activeFatwa?.id);
	}, [activeDetail, fatwaPrinciples, activeFatwa]);

	const selectedFatwaPrinciple =
		currentFatwaPrinciples.find(
			(fp) =>
				fp.principle_id ===
				(activePrincipleId || currentFatwaPrinciples[0]?.principle_id),
		) || currentFatwaPrinciples[0];

	const currentPrinciple =
		activeDetail?.principles.find(
			(p) => p.id === selectedFatwaPrinciple?.principle_id,
		) || principles.find((p) => p.id === selectedFatwaPrinciple?.principle_id);

	const answeredCount = learner.stats.answeredCount;

	const handleNextRandomQuestion = useCallback(() => {
		learner.nextQuestion({
			scholar: selectedScholar,
			chapter: selectedChapter,
		});
	}, [learner, selectedScholar, selectedChapter]);

	const handleFatwaSelect = (fatwaId: string) => {
		setActiveFatwaId(fatwaId);
		setActivePrincipleId(null);
		learner.selectQuestion(fatwaId);
	};

	const handlePrincipleSelect = (principleId: string) => {
		setActivePrincipleId(principleId);
	};

	const handleBrowsePrinciple = (principleId: string) => {
		setActivePrincipleId(principleId);
	};

	const isSidebarVisible = mode === "browse" || showSidebarInQuiz;
	const readerColSpan = isSidebarVisible ? "lg:col-span-5" : "lg:col-span-7";
	const actionColSpan = isSidebarVisible ? "lg:col-span-4" : "lg:col-span-5";

	return (
		<div className="min-h-screen bg-page text-ink pb-10">
			<header className="sticky top-0 z-30 bg-page-raised/95 backdrop-blur border-b border-page-line">
				<div className="max-w-7xl mx-auto px-4 py-2.5 sm:py-3 space-y-2.5">
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<div className="flex items-center gap-3">
							<h1 className="font-amiri text-2xl sm:text-3xl font-bold text-ink tracking-wide leading-none">
								تأصيل
							</h1>
							<span className="text-[11px] text-ink-faint hidden sm:inline border-r border-page-line pr-3">
								تخريج فتاوى نور على الدرب على القواعد الفقهية والأصولية
							</span>
						</div>

						<div className="flex items-center gap-2">
							<div
								role="tablist"
								aria-label="وضع الواجهة"
								className="inline-flex p-0.5 rounded-lg border border-page-line bg-page-sunken text-xs font-semibold"
							>
								<button
									type="button"
									role="tab"
									aria-selected={mode === "quiz"}
									onClick={() => setMode("quiz")}
									className={`px-3.5 py-1 rounded-md transition ${
										mode === "quiz"
											? "bg-page-raised text-accent shadow-xs"
											: "text-ink-muted hover:text-ink"
									}`}
								>
									اختبار
								</button>
								<button
									type="button"
									role="tab"
									aria-selected={mode === "browse"}
									onClick={() => setMode("browse")}
									className={`px-3.5 py-1 rounded-md transition ${
										mode === "browse"
											? "bg-page-raised text-accent shadow-xs"
											: "text-ink-muted hover:text-ink"
									}`}
								>
									تصفح
								</button>
							</div>

							{learner.userState.bookmarks.length > 0 && (
								<span className="inline-flex items-center gap-1 text-[11px] text-ink-muted px-2 py-0.5 bg-page-sunken rounded-md border border-page-line">
									<BookmarkCheck className="w-3.5 h-3.5 text-accent" />
									<span>{learner.userState.bookmarks.length}</span>
								</span>
							)}

							<span
								className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md border ${
									opfsReady
										? "border-accent/20 text-accent bg-accent-soft/40"
										: "border-page-line text-ink-muted bg-page-sunken"
								}`}
								title={bootLabel || undefined}
							>
								{opfsReady ? "متصل محلياً" : bootLabel || "تهيئة…"}
							</span>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 text-xs">
						<div className="relative min-w-[180px] flex-1 max-w-md">
							<Search className="w-3.5 h-3.5 absolute right-2.5 top-2 text-ink-faint" />
							<input
								type="search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="بحث في الأسئلة والأجوبة والقواعد…"
								className="w-full bg-page border border-page-line rounded-md pr-8 pl-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
							/>
						</div>

						<div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-page-line bg-page">
							<Filter className="w-3 h-3 text-ink-faint mx-1" />
							{(["ALL", "ابن باز", "ابن عثيمين"] as const).map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => setSelectedScholar(s)}
									className={`px-2 py-1 rounded text-xs transition ${
										selectedScholar === s
											? "bg-accent text-white font-semibold"
											: "text-ink-muted hover:text-ink"
									}`}
								>
									{s === "ALL" ? "الكل" : s}
								</button>
							))}
						</div>

						<select
							value={selectedChapter}
							onChange={(e) => setSelectedChapter(e.target.value)}
							aria-label="تصفية حسب الباب"
							className="bg-page border border-page-line text-ink rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent"
						>
							<option value="ALL">جميع الأبواب</option>
							{chapters.map((ch) => (
								<option key={ch} value={ch}>
									كتاب {chapterLabelAr(ch)}
								</option>
							))}
						</select>

						{mode === "quiz" && (
							<button
								type="button"
								onClick={() => setShowSidebarInQuiz((prev) => !prev)}
								className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
									showSidebarInQuiz
										? "bg-accent text-white border-accent"
										: "bg-page text-ink-muted border-page-line hover:text-ink"
								}`}
							>
								<Layers className="w-3.5 h-3.5" />
								<span>فهرس الفتاوى</span>
							</button>
						)}
					</div>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
				{isSidebarVisible && (
					<aside
						aria-label="فهرس الفتاوى"
						className="lg:col-span-3 order-3 lg:order-1 animate-fade-pane"
					>
						<div className="bg-page-raised border border-page-line rounded-lg p-3">
							<div className="flex items-center justify-between mb-2 pb-2 border-b border-page-line gap-2 flex-wrap">
								<h2 className="font-semibold text-xs text-ink flex items-center gap-1.5">
									<Layers className="w-3.5 h-3.5 text-accent" />
									الفتاوى
									<span className="text-ink-faint font-normal">
										({browseTotal > 0 ? browseTotal : displayFatwas.length})
									</span>
								</h2>

								{answeredCount > 0 && (
									<button
										type="button"
										onClick={() => setFilterUnansweredOnly((prev) => !prev)}
										title={
											filterUnansweredOnly
												? "إظهار جميع الفتاوى"
												: "إظهار غير المُجاب فقط"
										}
										className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
											filterUnansweredOnly
												? "bg-accent text-white border-accent"
												: "bg-page text-ink-muted border-page-line hover:text-ink"
										}`}
									>
										<CheckCircle2 className="w-3 h-3 text-emerald-500" />
										<span>{answeredCount} مُجاب</span>
									</button>
								)}
							</div>
							<div className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto">
								{displayFatwas.map((fatwa) => {
									const isActive = fatwa.id === activeFatwa?.id;
									const isSaved = learner.isBookmarked(fatwa.id);
									const isAnswered = learner.isQuestionAnswered(fatwa.id);
									return (
										<button
											key={fatwa.id}
											type="button"
											onClick={() => handleFatwaSelect(fatwa.id)}
											className={`w-full text-right p-2.5 rounded-md text-xs transition border ${
												isActive
													? "bg-accent-soft border-accent/30 text-ink"
													: "bg-transparent border-transparent hover:bg-page-sunken text-ink-soft"
											}`}
										>
											<div className="flex items-center justify-between text-[10px] text-ink-faint mb-1">
												<span className="font-medium text-accent-mid">
													{fatwa.scholar_name}
												</span>
												<span className="inline-flex items-center gap-1.5">
													#{fatwa.episode_number}
													{isAnswered && (
														<span title="تمت الإجابة على سؤال هذه الفتوى">
															<CheckCircle2 className="w-3 h-3 text-emerald-600" />
														</span>
													)}
													{isSaved && (
														<BookmarkCheck className="w-3 h-3 text-accent" />
													)}
												</span>
											</div>
											<div className="line-clamp-2 font-amiri text-sm leading-snug text-ink">
												{fatwa.question_text}
											</div>
										</button>
									);
								})}
								{displayFatwas.length === 0 && (
									<p className="text-center text-ink-faint text-xs py-6">
										{filterUnansweredOnly
											? "أجبت على جميع الفتاوى المطابقة!"
											: "لا نتائج مطابقة"}
									</p>
								)}
							</div>
						</div>
					</aside>
				)}

				<div
					className={`${readerColSpan} space-y-4 order-1 lg:order-2 transition-all`}
				>
					<FatwaReader
						fatwaId={activeFatwaId}
						fatwa={activeFatwa}
						principles={principles}
						fatwaPrinciples={currentFatwaPrinciples}
						activePrincipleId={activePrincipleId}
						showExtractedPrinciples={mode === "browse"}
						onSelectPrinciple={handlePrincipleSelect}
					/>
				</div>

				<aside
					aria-label={mode === "quiz" ? "لوحة الاختبار" : "فهرس التصفح"}
					className={`${actionColSpan} order-2 lg:order-3 transition-all`}
				>
					{mode === "quiz" ? (
						<QuizPane
							fatwa={activeFatwa}
							principle={currentPrinciple}
							fatwaPrinciple={selectedFatwaPrinciple}
							onNextQuestion={handleNextRandomQuestion}
						/>
					) : (
						<BrowseIndex
							fatwas={displayFatwas}
							principles={principles}
							fatwaPrinciples={fatwaPrinciples}
							activeFatwaId={activeFatwa?.id}
							onSelectFatwa={handleFatwaSelect}
							onSelectPrinciple={handleBrowsePrinciple}
						/>
					)}
				</aside>
			</main>
		</div>
	);
};
