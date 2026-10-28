import {
	ChevronDown,
	ChevronLeft,
	ChevronsDownUp,
	ChevronsUpDown,
	FolderTree,
	Library,
	Search,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildPrinciplesTree } from "../data/mockArchiveAdapter";
import { sqliteClient } from "../services/sqliteClient";
import type {
	BrowseTab,
	Fatwa,
	FatwaPrinciple,
	FatwaSummary,
	Principle,
	PrincipleTreeNode,
} from "../types";
import {
	chapterLabelAr,
	getPrincipleKindBadge,
	highlightArabicMatches,
	matchesSearch,
	normalizeArabic,
} from "../utils/arabic";

interface BrowseIndexProps {
	fatwas?: (Fatwa | FatwaSummary)[];
	principles?: Principle[];
	fatwaPrinciples?: FatwaPrinciple[];
	activeFatwaId?: string;
	onSelectFatwa: (fatwaId: string) => void;
	onSelectPrinciple: (principleId: string) => void;
}

/**
 * Recursively filters a tree of PrincipleTreeNode based on a search term,
 * returning the filtered nodes and the set of all ancestor IDs to auto-expand.
 */
function filterTreeNodes(
	nodes: PrincipleTreeNode[],
	query: string,
): { filtered: PrincipleTreeNode[]; matchingAncestorIds: Set<string> } {
	if (!query.trim()) {
		return { filtered: nodes, matchingAncestorIds: new Set() };
	}

	const normQuery = normalizeArabic(query);
	const matchingAncestorIds = new Set<string>();

	function checkNode(node: PrincipleTreeNode): PrincipleTreeNode | null {
		const isSelfMatch =
			matchesSearch(normQuery, node.canonical_text_norm) ||
			matchesSearch(normQuery, normalizeArabic(node.canonical_text_ar)) ||
			matchesSearch(normQuery, normalizeArabic(node.general_explanation_ar));

		const filteredChildren: PrincipleTreeNode[] = [];
		for (const child of node.children) {
			const res = checkNode(child);
			if (res) filteredChildren.push(res);
		}

		if (isSelfMatch || filteredChildren.length > 0) {
			if (filteredChildren.length > 0) {
				matchingAncestorIds.add(node.id);
			}
			return {
				...node,
				children: filteredChildren,
			};
		}

		return null;
	}

	const filtered: PrincipleTreeNode[] = [];
	for (const n of nodes) {
		const res = checkNode(n);
		if (res) filtered.push(res);
	}

	return { filtered, matchingAncestorIds };
}

function renderHighlightedText(text: string, query: string): React.ReactNode {
	if (!query.trim()) return text;
	const normQ = normalizeArabic(query);
	const tokens = normQ.split(" ").filter((t) => t.length > 1);
	if (tokens.length === 0) return text;
	const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
	const parts = text.split(pattern);
	let charCursor = 0;
	return parts.map((part) => {
		const key = `hl-${charCursor}-${part.length}`;
		charCursor += part.length;
		const isMatch = tokens.some((t) => normalizeArabic(part).includes(t));
		if (isMatch) {
			return (
				<mark
					key={key}
					className="bg-accent-soft text-ink rounded px-0.5 font-bold"
				>
					{part}
				</mark>
			);
		}
		return <span key={key}>{part}</span>;
	});
}

/**
 * Recursive tree node rendering component for multiple levels of nesting.
 */
interface PrincipleTreeItemProps {
	node: PrincipleTreeNode;
	depth: number;
	selectedId: string | null;
	expandedMap: Record<string, boolean>;
	onToggleExpand: (id: string) => void;
	onSelect: (id: string) => void;
	searchQuery: string;
}

const PrincipleTreeItem: React.FC<PrincipleTreeItemProps> = ({
	node,
	depth,
	selectedId,
	expandedMap,
	onToggleExpand,
	onSelect,
	searchQuery,
}) => {
	const hasChildren = node.children && node.children.length > 0;
	// By default: roots (depth 0) are expanded; sub-levels are collapsed unless toggled or searched
	const isExpanded = expandedMap[node.id] ?? depth === 0;
	const isSelected = selectedId === node.id;
	const count = node.fatwas_count ?? 0;
	const kindBadge = getPrincipleKindBadge(node);

	return (
		<li className="relative group">
			<div
				className={`flex items-start gap-1 p-1 rounded-md text-xs transition border ${
					isSelected
						? "bg-accent-soft/80 border-accent/40 text-accent-deep shadow-xs"
						: count === 0
							? "border-transparent text-ink-muted hover:bg-page-sunken/60"
							: "border-transparent hover:bg-page-sunken/80 text-ink-soft"
				}`}
			>
				{/* Expand/Collapse chevron or alignment spacer */}
				{hasChildren ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggleExpand(node.id);
						}}
						aria-label={isExpanded ? "طي التفريعات" : "توسيع التفريعات"}
						title={isExpanded ? "طي التفريعات" : "توسيع التفريعات"}
						className="p-1 -mr-0.5 rounded text-ink-faint hover:text-ink hover:bg-page-raised transition shrink-0"
					>
						{isExpanded ? (
							<ChevronDown className="w-3.5 h-3.5 text-accent" />
						) : (
							<ChevronLeft className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink" />
						)}
					</button>
				) : (
					<span className="w-5 h-5 flex items-center justify-center shrink-0">
						<span className="w-1.5 h-1.5 rounded-full bg-page-line group-hover:bg-accent/40" />
					</span>
				)}

				{/* Principle Card Selection */}
				<button
					type="button"
					onClick={() => onSelect(node.id)}
					disabled={count === 0}
					className={`flex-1 text-right py-0.5 pl-1 transition ${
						count === 0 ? "cursor-not-allowed opacity-75" : ""
					}`}
				>
					<div className="flex items-center gap-1.5 flex-wrap mb-0.5">
						<span
							className={`inline-flex items-center px-1.5 py-0.2 text-[9px] font-semibold rounded border ${kindBadge.color}`}
						>
							{kindBadge.label}
						</span>

						{count > 0 ? (
							<span className="text-[10px] text-ink-faint font-medium">
								{count} فتوى
							</span>
						) : (
							<span className="text-[10px] text-ink-faint/70 italic">
								بلا ربط
							</span>
						)}

						{hasChildren && !isExpanded && (
							<span className="text-[10px] text-accent/80 font-medium">
								(+{node.children.length} فروع)
							</span>
						)}
					</div>

					<span className="font-amiri text-[13px] leading-snug block text-ink">
						{renderHighlightedText(node.canonical_text_ar, searchQuery)}
					</span>
				</button>
			</div>

			{/* Nested Children Tree */}
			{hasChildren && isExpanded && (
				<ul className="pr-3.5 mt-0.5 space-y-0.5 border-r-2 border-page-line/70 mr-2">
					{node.children.map((child) => (
						<PrincipleTreeItem
							key={child.id}
							node={child}
							depth={depth + 1}
							selectedId={selectedId}
							expandedMap={expandedMap}
							onToggleExpand={onToggleExpand}
							onSelect={onSelect}
							searchQuery={searchQuery}
						/>
					))}
				</ul>
			)}
		</li>
	);
};

export const BrowseIndex: React.FC<BrowseIndexProps> = ({
	fatwas = [],
	principles = [],
	fatwaPrinciples = [],
	activeFatwaId,
	onSelectFatwa,
	onSelectPrinciple,
}) => {
	const [tab, setTab] = useState<BrowseTab>("principles");
	const [selectedPrincipleId, setSelectedPrincipleId] = useState<string | null>(
		null,
	);
	const [searchQuery, setSearchQuery] = useState("");

	// Top-level section expansion
	const [expandedSections, setExpandedSections] = useState<
		Record<string, boolean>
	>({
		fiqh: true,
		usul: true,
	});

	// Individual principle node expand/collapse state
	const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
		{},
	);

	// Chapter accordion state
	const [expandedChapters, setExpandedChapters] = useState<
		Record<string, boolean>
	>({});

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
			.browseFatwas({ limit: 120 })
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

	// Build or reuse the multi-level tree
	const baseTree = useMemo(() => {
		if (queriedTree.length > 0) return queriedTree;
		return buildPrinciplesTree(principles, fatwaPrinciples);
	}, [queriedTree, principles, fatwaPrinciples]);

	// Total count of all principles in tree
	const totalPrinciplesCount = useMemo(() => {
		let count = 0;
		function walk(nodes: PrincipleTreeNode[]) {
			count += nodes.length;
			for (const n of nodes) {
				if (n.children?.length) walk(n.children);
			}
		}
		walk(baseTree);
		return count;
	}, [baseTree]);

	// Filter tree by search query
	const { filtered: filteredTree, matchingAncestorIds } = useMemo(() => {
		return filterTreeNodes(baseTree, searchQuery);
	}, [baseTree, searchQuery]);

	// Auto-expand branches when searching
	useEffect(() => {
		if (searchQuery.trim() && matchingAncestorIds.size > 0) {
			setExpandedNodes((prev) => {
				const next = { ...prev };
				for (const id of matchingAncestorIds) {
					next[id] = true;
				}
				return next;
			});
			setExpandedSections({ fiqh: true, usul: true });
		}
	}, [searchQuery, matchingAncestorIds]);

	// Separate into Fiqh vs Usul roots
	const fiqhRoots = useMemo(() => {
		return filteredTree.filter((n) => n.science === "fiqh");
	}, [filteredTree]);

	const usulRoots = useMemo(() => {
		return filteredTree.filter((n) => n.science === "usul");
	}, [filteredTree]);

	// Classical Mabahith grouping for Usul
	const usulSections = useMemo(() => {
		const groups: {
			id: string;
			title: string;
			nodes: PrincipleTreeNode[];
		}[] = [
			{
				id: "usul_alfaz",
				title: "دلالات الألفاظ ومناهج الاستنباط",
				nodes: usulRoots.filter(
					(n) =>
						n.domain_section === "دلالات الألفاظ" ||
						n.id.startsWith("usul.alfaz"),
				),
			},
			{
				id: "usul_adillah",
				title: "الأدلة الشرعية الكلية",
				nodes: usulRoots.filter(
					(n) =>
						n.domain_section?.includes("الأدلة") ||
						n.id.startsWith("usul.adillah") ||
						n.id === "principle-ibaha" ||
						n.id === "principle-tawqeef",
				),
			},
			{
				id: "usul_ahkam",
				title: "الأحكام الشرعية (التكليفية والوضعية)",
				nodes: usulRoots.filter(
					(n) =>
						n.domain_section?.includes("الأحكام") ||
						n.id.startsWith("usul.ahkam") ||
						n.id === "principle-wajib",
				),
			},
			{
				id: "usul_taarud",
				title: "التعارض والترجيح",
				nodes: usulRoots.filter(
					(n) =>
						n.domain_section?.includes("التعارض") ||
						n.id.startsWith("usul.taarud"),
				),
			},
		];

		// Collect any leftover nodes that didn't match the 4 classical mabahith
		const assignedIds = new Set(
			groups.flatMap((g) => g.nodes.map((n) => n.id)),
		);
		const otherNodes = usulRoots.filter((n) => !assignedIds.has(n.id));
		if (otherNodes.length > 0) {
			groups.push({
				id: "usul_other",
				title: "قواعد أصولية عامة",
				nodes: otherNodes,
			});
		}

		return groups.filter((g) => g.nodes.length > 0);
	}, [usulRoots]);

	// Chapter tree for the "بالأبواب" tab
	const activeFatwasForChapters =
		chapterFatwas.length > 0 ? chapterFatwas : fatwas;
	const chapterTree = useMemo(() => {
		const map = new Map<string, Map<string, (Fatwa | FatwaSummary)[]>>();
		const normQ = normalizeArabic(searchQuery);

		for (const f of activeFatwasForChapters) {
			const qNorm =
				"question_norm" in f && f.question_norm
					? f.question_norm
					: normalizeArabic(f.question_text);
			if (
				normQ &&
				!matchesSearch(normQ, qNorm) &&
				!matchesSearch(normQ, normalizeArabic(f.topic_chapter)) &&
				!matchesSearch(normQ, normalizeArabic(f.topic_subtopic || ""))
			) {
				continue;
			}
			if (!map.has(f.topic_chapter)) map.set(f.topic_chapter, new Map());
			const subs = map.get(f.topic_chapter)!;
			const key = f.topic_subtopic || "عام";
			if (!subs.has(key)) subs.set(key, []);
			subs.get(key)!.push(f);
		}
		return Array.from(map.entries()).sort((a, b) =>
			chapterLabelAr(a[0]).localeCompare(chapterLabelAr(b[0]), "ar"),
		);
	}, [activeFatwasForChapters, searchQuery]);

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

	const toggleNodeExpand = useCallback((id: string) => {
		setExpandedNodes((prev) => ({
			...prev,
			[id]: !prev[id],
		}));
	}, []);

	const toggleSection = (id: string) => {
		setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const toggleChapter = (id: string) => {
		setExpandedChapters((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const expandAll = () => {
		const allIds: Record<string, boolean> = {};
		function collect(nodes: PrincipleTreeNode[]) {
			for (const n of nodes) {
				allIds[n.id] = true;
				if (n.children?.length) collect(n.children);
			}
		}
		collect(baseTree);
		setExpandedNodes(allIds);
		setExpandedSections({ fiqh: true, usul: true });
	};

	const collapseAll = () => {
		setExpandedNodes({});
	};

	return (
		<div className="bg-page-raised border border-page-line rounded-lg overflow-hidden animate-fade-pane flex flex-col max-h-[calc(100vh-8rem)]">
			{/* Top Tabs */}
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
					شجرة القواعد والأصول
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
					أبواب الفقه
				</button>
			</div>

			{/* Search Filter Bar */}
			<div className="p-2 border-b border-page-line/60 bg-page-sunken/30 shrink-0">
				<div className="relative">
					<Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={
							tab === "principles"
								? "ابحث في القواعد والضوابط..."
								: "ابحث في الأبواب والمسائل..."
						}
						className="w-full pr-8 pl-7 py-1.5 text-xs rounded-md border border-page-line bg-page text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => setSearchQuery("")}
							aria-label="مسح البحث"
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					)}
				</div>

				{tab === "principles" && (
					<div className="flex items-center justify-between mt-1.5 pt-1 px-1 text-[11px] text-ink-faint">
						<span>
							{searchQuery
								? `نتائج البحث: ${filteredTree.length}`
								: `${totalPrinciplesCount} قاعدة وضابط`}
						</span>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={expandAll}
								className="inline-flex items-center gap-1 hover:text-accent transition"
								title="توسيع كل الفروع"
							>
								<ChevronsUpDown className="w-3 h-3" />
								توسيع
							</button>
							<span className="text-page-line">|</span>
							<button
								type="button"
								onClick={collapseAll}
								className="inline-flex items-center gap-1 hover:text-accent transition"
								title="طي كل الفروع"
							>
								<ChevronsDownUp className="w-3 h-3" />
								طي
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Tree View Content */}
			<div className="overflow-y-auto flex-1 p-2">
				{tab === "principles" && (
					<div className="space-y-2">
						{/* SECTION 1: Al-Qawa'id Al-Fiqhiyyah */}
						{fiqhRoots.length > 0 && (
							<div className="border border-page-line/70 rounded-md overflow-hidden bg-page/40">
								<button
									type="button"
									onClick={() => toggleSection("fiqh")}
									className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-bold text-ink bg-page-sunken/60 hover:bg-page-sunken transition"
								>
									<span className="flex items-center gap-1.5">
										<FolderTree className="w-3.5 h-3.5 text-accent" />
										<span>القواعد الفقهية الكبرى وضوابطها</span>
										<span className="text-ink-faint font-normal mr-1">
											({fiqhRoots.length} كبرى)
										</span>
									</span>
									{expandedSections.fiqh ? (
										<ChevronDown className="w-4 h-4 text-accent" />
									) : (
										<ChevronLeft className="w-4 h-4 text-ink-muted" />
									)}
								</button>

								{expandedSections.fiqh && (
									<ul className="p-2 space-y-1">
										{fiqhRoots.map((root) => (
											<PrincipleTreeItem
												key={root.id}
												node={root}
												depth={0}
												selectedId={selectedPrincipleId}
												expandedMap={expandedNodes}
												onToggleExpand={toggleNodeExpand}
												onSelect={selectPrinciple}
												searchQuery={searchQuery}
											/>
										))}
									</ul>
								)}
							</div>
						)}

						{/* SECTION 2: Al-Qawa'id Al-Usuliyyah */}
						{usulSections.length > 0 && (
							<div className="border border-page-line/70 rounded-md overflow-hidden bg-page/40">
								<button
									type="button"
									onClick={() => toggleSection("usul")}
									className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-bold text-ink bg-page-sunken/60 hover:bg-page-sunken transition"
								>
									<span className="flex items-center gap-1.5">
										<FolderTree className="w-3.5 h-3.5 text-indigo-500" />
										<span>أصول الفقه ومناهج الاستنباط</span>
										<span className="text-ink-faint font-normal mr-1">
											({usulRoots.length} أصل)
										</span>
									</span>
									{expandedSections.usul ? (
										<ChevronDown className="w-4 h-4 text-indigo-500" />
									) : (
										<ChevronLeft className="w-4 h-4 text-ink-muted" />
									)}
								</button>

								{expandedSections.usul && (
									<div className="p-2 space-y-2">
										{usulSections.map((sec) => (
											<div
												key={sec.id}
												className="border-r-2 border-indigo-500/30 pr-2 pt-0.5"
											>
												<div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 mb-1 flex items-center gap-1">
													<span>{sec.title}</span>
													<span className="text-[10px] text-ink-faint font-normal">
														({sec.nodes.length})
													</span>
												</div>
												<ul className="space-y-1">
													{sec.nodes.map((node) => (
														<PrincipleTreeItem
															key={node.id}
															node={node}
															depth={0}
															selectedId={selectedPrincipleId}
															expandedMap={expandedNodes}
															onToggleExpand={toggleNodeExpand}
															onSelect={selectPrinciple}
															searchQuery={searchQuery}
														/>
													))}
												</ul>
											</div>
										))}
									</div>
								)}
							</div>
						)}

						{fiqhRoots.length === 0 && usulSections.length === 0 && (
							<div className="text-center text-ink-faint text-xs py-8">
								لا توجد قواعد أو ضوابط مطابقة للبحث
							</div>
						)}
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
								<div
									key={chapter}
									className="border border-page-line/60 rounded-md overflow-hidden bg-page/40"
								>
									<button
										type="button"
										onClick={() => toggleChapter(chapter)}
										className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-semibold text-ink hover:bg-page-sunken/70 rounded-md transition"
									>
										<span>
											كتاب {chapterLabelAr(chapter)}
											<span className="text-ink-faint font-normal mr-1.5">
												({total})
											</span>
										</span>
										{open ? (
											<ChevronDown className="w-3.5 h-3.5 text-accent" />
										) : (
											<ChevronLeft className="w-3.5 h-3.5 text-ink-faint" />
										)}
									</button>
									{open && (
										<div className="pr-2 pb-2 space-y-2 border-r-2 border-accent/20 mr-2 mt-1">
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

						{chapterTree.length === 0 && (
							<div className="text-center text-ink-faint text-xs py-8">
								لا توجد مسائل مطابقة للبحث
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};
