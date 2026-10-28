import type React from "react";
import { createContext, useContext, useSyncExternalStore } from "react";
import {
	type CurrentQuizQuestion,
	learnerStore as defaultLearnerStore,
	type LearnerProgressStore,
	type LearnerStats,
} from "../stores/learnerStore";
import type {
	QuizQuestionMode,
	Scholar,
	UserQuizHistoryItem,
	UserState,
} from "../types";

export const LearnerProgressContext =
	createContext<LearnerProgressStore>(defaultLearnerStore);

export interface UseLearnerProgressReturn {
	currentQuestion: CurrentQuizQuestion | null;
	stats: LearnerStats;
	isBookmarked: (fatwaId: string) => boolean;
	recordAttempt: (
		selectedId: string,
		timeSpentMs: number,
	) => Promise<UserQuizHistoryItem | null>;
	nextQuestion: (filter?: {
		scholar?: Scholar | "ALL";
		chapter?: string;
		mode?: QuizQuestionMode;
	}) => Promise<void> | void;
	toggleBookmark: (fatwaId: string) => Promise<boolean>;
	resetProgress: () => Promise<void>;
	selectQuestion: (fatwaId: string, principleId?: string | null) => void;
	isQuestionAnswered: (fatwaId: string, principleId?: string | null) => boolean;
	getAnsweredRecord: (
		fatwaId: string,
		principleId?: string | null,
	) =>
		| { isCorrect: boolean; selectedId: string; timestamp: number }
		| undefined;
	userState: UserState;
}

export function useLearnerProgress(
	customStore?: LearnerProgressStore,
): UseLearnerProgressReturn {
	const contextStore = useContext(LearnerProgressContext);
	const store = customStore || contextStore || defaultLearnerStore;

	useSyncExternalStore(store.subscribe, () => store.getVersion());

	return {
		currentQuestion: store.getCurrentQuestion(),
		stats: store.getStats(),
		isBookmarked: (fatwaId: string) => store.isBookmarked(fatwaId),
		recordAttempt: (selectedId: string, timeSpentMs: number) =>
			store.recordAttempt(selectedId, timeSpentMs),
		nextQuestion: (filter?: {
			scholar?: Scholar | "ALL";
			chapter?: string;
			mode?: QuizQuestionMode;
		}) => store.nextQuestion(filter),
		toggleBookmark: (fatwaId: string) => store.toggleBookmark(fatwaId),
		resetProgress: () => store.resetProgress(),
		selectQuestion: (fatwaId: string, principleId?: string | null) =>
			store.selectQuestion(fatwaId, principleId),
		isQuestionAnswered: (fatwaId: string, principleId?: string | null) =>
			store.isQuestionAnswered(fatwaId, principleId),
		getAnsweredRecord: (fatwaId: string, principleId?: string | null) =>
			store.getAnsweredRecord(fatwaId, principleId),
		userState: store.getUserState(),
	};
}

export const LearnerProgressProvider: React.FC<{
	store?: LearnerProgressStore;
	children: React.ReactNode;
}> = ({ store = defaultLearnerStore, children }) => {
	return (
		<LearnerProgressContext.Provider value={store}>
			{children}
		</LearnerProgressContext.Provider>
	);
};
