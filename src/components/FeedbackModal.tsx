import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	FileText,
	Flag,
	HelpCircle,
	Layers,
	Loader2,
	Send,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type {
	Fatwa,
	FatwaPrinciple,
	FeedbackReason,
	Principle,
} from "../types";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./TurnstileWidget";

interface FeedbackModalProps {
	isOpen: boolean;
	onClose: () => void;
	fatwa: Fatwa | undefined;
	principle?: Principle;
	fatwaPrinciple?: FatwaPrinciple;
	quizChoices?: {
		id: string;
		text: string;
		category?: string;
		is_correct?: boolean;
	}[];
	selectedChoiceId?: string | null;
}

interface ReasonOption {
	key: FeedbackReason;
	title: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
}

const REASON_OPTIONS: ReasonOption[] = [
	{
		key: "wrong_principle",
		title: "القاعدة المختارة غير صحيحة",
		description: "تخريج المسألة أو القاعدة المعتمدة كجواب صحيح غير صائبة شرعاً.",
		icon: AlertCircle,
	},
	{
		key: "wrong_explanation",
		title: "التعليل أو التخريج غير دقيق",
		description: "وجه بناء الحكم أو الشاهد المقتبس أو بيان القاعدة غير دقيق.",
		icon: FileText,
	},
	{
		key: "clerical_error",
		title: "خطأ نصي أو مطبعي",
		description: "سقط أو تصحيف في نص السؤال أو الجواب أو ألفاظ القاعدة.",
		icon: AlertTriangle,
	},
	{
		key: "no_correct_option",
		title: "لا يوجد خيار صحيح بين الخيارات",
		description: "الخيارات الأربعة المعروضة لا تتضمن الجواب الفقهي الصواب.",
		icon: Layers,
	},
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
	isOpen,
	onClose,
	fatwa,
	principle,
	fatwaPrinciple,
	quizChoices,
	selectedChoiceId,
}) => {
	const [selectedReason, setSelectedReason] =
		useState<FeedbackReason>("wrong_principle");
	const [userComment, setUserComment] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submissionStatus, setSubmissionStatus] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const turnstileRef = useRef<TurnstileWidgetHandle>(null);

	useEffect(() => {
		if (isOpen) {
			setSelectedReason("wrong_principle");
			setUserComment("");
			setSubmissionStatus("idle");
			setErrorMessage(null);
			turnstileRef.current?.reset();
		}
	}, [isOpen]);

	if (!isOpen || !fatwa) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isSubmitting) return;

		setIsSubmitting(true);
		setErrorMessage(null);

		try {
			// 1. Acquire Turnstile token invisibly
			const token = await turnstileRef.current?.execute();

			// 2. Build payload
			const payload = {
				fatwa_id: fatwa.id,
				scholar_name: fatwa.scholar_name,
				topic_chapter: fatwa.topic_chapter,
				topic_subtopic: fatwa.topic_subtopic,
				question_excerpt: fatwa.question_text.slice(0, 200),
				principle_id:
					principle?.id || fatwaPrinciple?.principle_id || undefined,
				principle_text: principle?.canonical_text_ar || undefined,
				reason: selectedReason,
				user_comment: userComment.trim() || undefined,
				options_shown: quizChoices?.map((c) => ({
					id: c.id,
					text: c.text,
					is_correct: c.is_correct,
				})),
				user_selected_id: selectedChoiceId || undefined,
				turnstile_token: token || "fallback-local-token",
			};

			// 3. Post to API endpoint
			const res = await fetch("/api/feedback", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				throw new Error(
					errorData.error || `خطأ في إرسال البلاغ (${res.status})`,
				);
			}

			setSubmissionStatus("success");
			setTimeout(() => {
				onClose();
			}, 2000);
		} catch (err: any) {
			setSubmissionStatus("error");
			setErrorMessage(
				err.message || "تعذر إرسال الملاحظة حالياً. يُرجى المحاولة لاحقاً.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="feedback-dialog-title"
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-fade-pane"
			onClick={(e) => {
				if (e.target === e.currentTarget && !isSubmitting) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape" && !isSubmitting) onClose();
			}}
		>
			<div className="bg-page-raised border border-page-line rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-right">
				{/* Header */}
				<div className="px-5 py-3.5 border-b border-page-line flex items-center justify-between bg-page-sunken/50">
					<div className="flex items-center gap-2">
						<span className="p-1.5 rounded-md bg-accent-soft text-accent">
							<Flag className="w-4 h-4" />
						</span>
						<h2
							id="feedback-dialog-title"
							className="font-semibold text-sm text-ink"
						>
							إبلاغ عن ملاحظة أو خطأ في المسألة
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={isSubmitting}
						className="p-1 text-ink-muted hover:text-ink rounded-md transition hover:bg-page"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Content */}
				{submissionStatus === "success" ? (
					<div className="p-8 text-center space-y-3">
						<div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
							<CheckCircle2 className="w-7 h-7" />
						</div>
						<h3 className="font-bold text-base text-ink">
							جزاكم الله خيراً ونفع بكم
						</h3>
						<p className="text-xs text-ink-muted leading-relaxed">
							تم تسجيل ملاحظتكم في قاعدة المراجعة والتدقيق، وسيتم فحص المسألة
							وتصويبها في التحديث القادم إن شاء الله.
						</p>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="p-5 space-y-4">
						{/* Fatwa & Principle Context Box */}
						<div className="p-3 rounded-lg bg-page-sunken/80 border border-page-line text-xs space-y-2">
							<div className="flex items-center justify-between gap-2 flex-wrap">
								<span className="font-mono text-ink-faint font-semibold">
									[{fatwa.id}]
								</span>
								<span className="text-ink-muted">
									الشيخ {fatwa.scholar_name} · كتاب {fatwa.topic_chapter}
								</span>
							</div>
							<p className="font-amiri text-[13px] text-ink-soft line-clamp-2 leading-relaxed">
								«{fatwa.question_text}»
							</p>
							{principle && (
								<div className="pt-1.5 border-t border-page-line/60 text-[11px] text-accent-deep flex items-center gap-1.5">
									<HelpCircle className="w-3.5 h-3.5 text-accent shrink-0" />
									<span className="line-clamp-1">
										القاعدة الحالية: «{principle.canonical_text_ar}»
									</span>
								</div>
							)}
						</div>

						{/* Reason selector (Tap / Select cards) */}
						<div className="space-y-1.5">
							<div className="block text-xs font-semibold text-ink">
								سبب الإبلاغ <span className="text-accent">*</span>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{REASON_OPTIONS.map((opt) => {
									const isSelected = selectedReason === opt.key;
									const Icon = opt.icon;
									return (
										<button
											key={opt.key}
											type="button"
											onClick={() => setSelectedReason(opt.key)}
											className={`text-right p-2.5 rounded-lg border text-xs transition flex items-start gap-2 ${
												isSelected
													? "border-accent bg-accent-soft/70 text-ink shadow-xs ring-1 ring-accent/30"
													: "border-page-line bg-page hover:bg-page-sunken/60 text-ink-soft"
											}`}
										>
											<Icon
												className={`w-4 h-4 mt-0.5 shrink-0 ${
													isSelected ? "text-accent" : "text-ink-muted"
												}`}
											/>
											<div className="space-y-0.5">
												<div className="font-medium text-[12px]">
													{opt.title}
												</div>
												<div className="text-[10px] text-ink-muted leading-tight">
													{opt.description}
												</div>
											</div>
										</button>
									);
								})}
							</div>
						</div>

						{/* Comment field */}
						<div className="space-y-1.5">
							<label
								htmlFor="feedback-comment"
								className="block text-xs font-semibold text-ink"
							>
								بيان وجه الملاحظة أو البديل الصحيح{" "}
								<span className="text-ink-faint font-normal">(اختياري)</span>
							</label>
							<textarea
								id="feedback-comment"
								rows={3}
								value={userComment}
								onChange={(e) => setUserComment(e.target.value)}
								placeholder="مثال: الصواب تخريجها على ضابط عفو الشريعة عن الخطأ والنسيان لأن السائلة فعلت المحظور ناسية..."
								className="w-full text-xs font-amiri text-ink p-2.5 rounded-lg border border-page-line bg-page focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent leading-relaxed"
							/>
						</div>

						{/* Error Message */}
						{errorMessage && (
							<div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
								<AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
								<span>{errorMessage}</span>
							</div>
						)}

						{/* Invisible Turnstile */}
						<TurnstileWidget ref={turnstileRef} />

						{/* Footer Buttons */}
						<div className="pt-2 border-t border-page-line flex items-center justify-between gap-3 flex-wrap">
							<span className="text-[10px] text-ink-faint flex items-center gap-1">
								<span>محمي بواسطة Cloudflare Turnstile</span>
							</span>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={onClose}
									disabled={isSubmitting}
									className="px-3.5 py-1.5 rounded-md border border-page-line text-ink-soft text-xs hover:bg-page hover:text-ink transition"
								>
									إلغاء
								</button>
								<button
									type="submit"
									disabled={isSubmitting}
									className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent-mid shadow-xs transition disabled:opacity-50"
								>
									{isSubmitting ? (
										<>
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
											<span>جارٍ الإرسال…</span>
										</>
									) : (
										<>
											<Send className="w-3.5 h-3.5" />
											<span>إرسال البلاغ</span>
										</>
									)}
								</button>
							</div>
						</div>
					</form>
				)}
			</div>
		</div>
	);
};
