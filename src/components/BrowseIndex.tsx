import { ChevronDown, ChevronLeft, FolderTree, Library } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { flattenPrinciplesTree } from "../data/mockArchiveAdapter";
import { sqliteClient } from "../services/sqliteClient";
import type {
	BrowseTab,
	Fatwa,
	FatwaPrinciple,
	FatwaSummary,
	Principle,
	PrincipleTreeNode,
} from "../types";
import { CATEGORY_LABELS, chapterLabelAr } from "../utils/arabic";

interface BrowseIndexProps {
	fatwas?: (Fatwa | FatwaSummary)[];
	principles?: Principle[];
	fatwaPrinciples?: FatwaPrinciple[];
	activeFatwaId?: string;
	onSelectFatwa: (fatwaId: string) => void;
	onSelectPrinciple: (principleId: string) => void;
}

const TREE_SECTIONS: {
	id: string;
	title: string;
	category: Principle["category"];
}[] = [
	{ id: "fiqhiyyah", title: "القواعد الفقهية", category: "fiqhiyyah" },
	{ id: "usuliyyah", title: "القواعد الأصولية", category: "usuliyyah" },
	{ id: "dabit", title: "الضوابط الفقهية", category: "dabit" },
];

export const BrowseIndex: React.FC<BrowseIndexProps> = ({
	fatwas = [],
	principles = [],
	fatwaPrinciples = [],
	activeFatwaId,
	onSelectFatwa,
	onSelectPrinciple,
}) => {
	const [tab, setTab] = useState<BrowseTab>("principles");
	const [expandedSections, setExpandedSections] = useState<
		Record<string, boolean>
	>({
		fiqhiyyah: true,
		usuliyyah: false,
		dabit: false,
	});
	const [expandedChapters, setExpandedChapters] = useState<
		Record<string, boolean>
	>({});
	const [selectedPrincipleId, setSelectedPrincipleId] = useState<string | null>(
		null,
	);

	// On-demand principles tree from sqliteClient
	const [queriedTree, setQueriedTree] = useState<PrincipleTreeNode[]>([]);
	// On-demand chapters fatwas from sqliteClient
	const [chapterFatwas, setChapterFatwas] = useState<FatwaSummary[]>([]);

	useEffect(() => {
		let cancelled = false;
		sqliteClient
			.getPrinciplesTree()
			.then((tree) => {
				if (!cancelled && tree.length > 0) {
					setQueriedTree(tree);
				}
			})
			.catch((_err) => {});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (tab !== "chapters") return;
		let cancelled = false;
		sqliteClient
			.browseFatwas({ limit: 100 })
			.then((res) => {
				if (!cancelled && res.fatwas.length > 0) {
					setChapterFatwas(res.fatwas);
				}
			})
			.catch((_err) => {});
		return () => {
			cancelled = true;
		};
	}, [tab]);

	const activePrinciples = useMemo(() => {
		if (queriedTree.length > 0) {
			return flattenPrinciplesTree(queriedTree);
		}
		return principles;
	}, [queriedTree, principles]);

	const linkedCountByPrinciple = useMemo(() => {
		const counts = new Map<string, number>();
		for (const fp of fatwaPrinciples) {
			counts.set(fp.principle_id, (counts.get(fp.principle_id) || 0) + 1);
		}
		return counts;
	}, [fatwaPrinciples]);

	const activeFatwasForChapters =
		chapterFatwas.length > 0 ? chapterFatwas : fatwas;

	const chapterTree = useMemo(() => {
		const map = new Map<string, Map<string, (Fatwa | FatwaSummary)[]>>();
		for (const f of activeFatwasForChapters) {
			if (!map.has(f.topic_chapter)) map.set(f.topic_chapter, new Map());
			const subs = map.get(f.topic_chapter)!;
			const key = f.topic_subtopic || "عام";
			if (!subs.has(key)) subs.set(key, []);
			subs.get(key)!.push(f);
		}
		return Array.from(map.entries()).sort((a, b) =>
			chapterLabelAr(a[0]).localeCompare(chapterLabelAr(b[0]), "ar"),
		);
	}, [activeFatwasForChapters]);

	const selectPrinciple = async (principleId: string) => {
		setSelectedPrincipleId(principleId);
		onSelectPrinciple(principleId);
		try {
			const res = await sqliteClient.browseFatwas({ principleId, limit: 1 });
			const first = res.fatwas[0];
			if (first) {
				onSelectFatwa(first.id);
				return;
			}
		} catch {
			/* fallback to prop search */
		}
		const linked = fatwaPrinciples.find(
			(fp) => fp.principle_id === principleId,
		);
		if (linked) onSelectFatwa(linked.fatwa_id);
	};

	const toggleSection = (id: string) => {
		setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const toggleChapter = (id: string) => {
		setExpandedChapters((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	return (
		<div className="bg-page-raised border border-page-line rounded-lg overflow-hidden animate-fade-pane flex flex-col max-h-[calc(100vh-8rem)]">
			<div className="flex border-b border-page-line shrink-0">
				<button
					type="button"
					onClick={() => setTab("principles")}
					className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition ${
						tab === "principles"
							? "text-accent border-b-2 border-accent bg-accent-soft/40"
							: "text-ink-muted hover:text-ink hover:bg-page-sunken/50"
					}`}
				>
					<FolderTree className="w-3.5 h-3.5" />
					بالقواعد
				</button>
				<button
					type="button"
					onClick={() => setTab("chapters")}
					className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition ${
						tab === "chapters"
							? "text-accent border-b-2 border-accent bg-accent-soft/40"
							: "text-ink-muted hover:text-ink hover:bg-page-sunken/50"
					}`}
				>
					<Library className="w-3.5 h-3.5" />
					بالأبواب
				</button>
			</div>

			<div className="overflow-y-auto flex-1 p-2">
				{tab === "principles" && (
					<div className="space-y-1">
						{TREE_SECTIONS.map((section) => {
							const items = activePrinciples
								.filter((p) => p.category === section.category)
								.sort(
									(a, b) =>
										(a.depth ?? 0) - (b.depth ?? 0) || a.id.localeCompare(b.id),
								);
							const open = expandedSections[section.id];
							return (
								<div key={section.id}>
									<button
										type="button"
										onClick={() => toggleSection(section.id)}
										className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-semibold text-ink hover:bg-page-sunken/70 rounded-md"
									>
										<span>
											{section.title}
											<span className="text-ink-faint font-normal mr-1.5">
												({items.length})
											</span>
										</span>
										{open ? (
											<ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
										) : (
											<ChevronLeft className="w-3.5 h-3.5 text-ink-faint" />
										)}
									</button>
									{open && (
										<ul className="pr-1 pb-2 space-y-0.5">
											{items.map((p) => {
												const depth = p.depth ?? 0;
												const count =
													(p as PrincipleTreeNode).fatwas_count !== undefined
														? (p as PrincipleTreeNode).fatwas_count
														: linkedCountByPrinciple.get(p.id) || 0;
												const active = selectedPrincipleId === p.id;
												return (
													<li
														key={p.id}
														style={{
															paddingInlineStart: `${Math.min(depth, 3) * 0.65}rem`,
														}}
													>
														<button
															type="button"
															onClick={() => selectPrinciple(p.id)}
															disabled={count === 0}
															className={`w-full text-right px-2.5 py-1.5 rounded-md text-xs transition border ${
																active
																	? "bg-accent-soft border-accent/30 text-accent-deep"
																	: count === 0
																		? "border-transparent text-ink-faint cursor-not-allowed"
																		: "border-transparent hover:bg-page-sunken text-ink-soft"
															}`}
														>
															<span className="font-amiri text-[13px] leading-snug block">
																{p.canonical_text_ar}
															</span>
															<span className="text-[10px] text-ink-faint mt-0.5 block">
																{CATEGORY_LABELS[p.category]?.title}
																{count > 0
																	? ` · ${count} فتوى`
																	: " · بلا ربط بعد"}
															</span>
														</button>
													</li>
												);
											})}
										</ul>
									)}
								</div>
							);
						})}
					</div>
				)}

				{tab === "chapters" && (
					<div className="space-y-1">
						{chapterTree.map(([chapter, subs]) => {
							const open = expandedChapters[chapter] ?? false;
							const total = Array.from(subs.values()).reduce(
								(n, arr) => n + arr.length,
								0,
							);
							return (
								<div key={chapter}>
									<button
										type="button"
										onClick={() => toggleChapter(chapter)}
										className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-semibold text-ink hover:bg-page-sunken/70 rounded-md"
									>
										<span>
											كتاب {chapterLabelAr(chapter)}
											<span className="text-ink-faint font-normal mr-1.5">
												({total})
											</span>
										</span>
										{open ? (
											<ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
										) : (
											<ChevronLeft className="w-3.5 h-3.5 text-ink-faint" />
										)}
									</button>
									{open && (
										<div className="pr-2 pb-2 space-y-2">
											{Array.from(subs.entries())
												.sort((a, b) => a[0].localeCompare(b[0], "ar"))
												.map(([sub, list]) => (
													<div key={sub}>
														<div className="px-2 py-1 text-[10px] font-semibold text-ink-muted">
															{sub}
														</div>
														<ul className="space-y-0.5">
															{list.slice(0, 40).map((f) => {
																const active = f.id === activeFatwaId;
																return (
																	<li key={f.id}>
																		<button
																			type="button"
																			onClick={() => onSelectFatwa(f.id)}
																			className={`w-full text-right px-2.5 py-1.5 rounded-md text-xs border transition ${
																				active
																					? "bg-accent-soft border-accent/30 text-accent-deep"
																					: "border-transparent hover:bg-page-sunken text-ink-soft"
																			}`}
																		>
																			<span className="font-amiri text-[13px] leading-snug line-clamp-2 block">
																				{f.question_text}
																			</span>
																			<span className="text-[10px] text-ink-faint mt-0.5 block">
																				{f.scholar_name}
																			</span>
																		</button>
																	</li>
																);
															})}
														</ul>
													</div>
												))}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};
