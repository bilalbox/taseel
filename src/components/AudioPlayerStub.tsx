import { AlertCircle, Loader2, Pause, Play, Radio } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Scholar } from "../types";

interface AudioPlayerStubProps {
	fatwaId?: string;
	scholar: Scholar;
	episodeNumber: number;
	initialTimestamp?: number;
	audioUrl?: string;
}

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Lazy audio player: does not fetch media until the user presses play.
 * Remount via `key={fatwaId}` from the parent so only one clip is ever wired.
 */
export const AudioPlayerStub: React.FC<AudioPlayerStubProps> = ({
	fatwaId = "unknown",
	scholar,
	episodeNumber,
	initialTimestamp = 0,
	audioUrl,
}) => {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [hasLoadedSrc, setHasLoadedSrc] = useState(false);
	const [currentTime, setCurrentTime] = useState(
		Math.max(0, initialTimestamp || 0),
	);
	const [duration, setDuration] = useState(0);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;

		const onLoaded = () => {
			setIsLoading(false);
			setDuration(el.duration || 0);
			const start = Math.max(0, initialTimestamp || 0);
			if (start > 0 && Number.isFinite(el.duration) && start < el.duration) {
				el.currentTime = start;
				setCurrentTime(start);
			}
		};
		const onTime = () => setCurrentTime(el.currentTime);
		const onEnded = () => setIsPlaying(false);
		const onErr = () => {
			setIsLoading(false);
			setIsPlaying(false);
			setError("تعذّر تشغيل التسجيل الصوتي");
		};
		const onPlaying = () => {
			setIsLoading(false);
			setIsPlaying(true);
		};
		const onPause = () => setIsPlaying(false);

		el.addEventListener("loadedmetadata", onLoaded);
		el.addEventListener("timeupdate", onTime);
		el.addEventListener("ended", onEnded);
		el.addEventListener("error", onErr);
		el.addEventListener("playing", onPlaying);
		el.addEventListener("pause", onPause);

		return () => {
			el.pause();
			el.removeAttribute("src");
			el.load();
			el.removeEventListener("loadedmetadata", onLoaded);
			el.removeEventListener("timeupdate", onTime);
			el.removeEventListener("ended", onEnded);
			el.removeEventListener("error", onErr);
			el.removeEventListener("playing", onPlaying);
			el.removeEventListener("pause", onPause);
		};
		// fatwaId identity is enforced by parent remount key; keep deps minimal.
	}, [initialTimestamp]);

	const ensureSrc = useCallback(() => {
		const el = audioRef.current;
		if (!el || !audioUrl) return false;
		if (!hasLoadedSrc || el.src !== audioUrl) {
			setIsLoading(true);
			setError(null);
			el.src = audioUrl;
			el.load();
			setHasLoadedSrc(true);
		}
		return true;
	}, [audioUrl, hasLoadedSrc]);

	const togglePlay = useCallback(async () => {
		const el = audioRef.current;
		if (!el || !audioUrl) return;

		if (isPlaying) {
			el.pause();
			return;
		}

		if (!ensureSrc()) return;

		try {
			setIsLoading(true);
			setError(null);
			const start = Math.max(0, initialTimestamp || 0);
			if (
				start > 0 &&
				el.readyState >= 1 &&
				start < (el.duration || Infinity)
			) {
				el.currentTime = start;
			}
			await el.play();
		} catch {
			setError("تعذّر تشغيل التسجيل الصوتي");
			setIsPlaying(false);
			setIsLoading(false);
		}
	}, [audioUrl, ensureSrc, initialTimestamp, isPlaying]);

	const seek = (value: number) => {
		const el = audioRef.current;
		if (!el || !hasLoadedSrc) return;
		el.currentTime = value;
		setCurrentTime(value);
	};

	const unavailable = !audioUrl;

	return (
		<div className="text-page-raised p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
			<audio ref={audioRef} preload="none" crossOrigin="anonymous">
				<track kind="captions" />
			</audio>

			<div className="flex items-center gap-3 w-full sm:w-auto">
				<button
					type="button"
					onClick={togglePlay}
					disabled={unavailable || !!error}
					aria-label={
						isPlaying ? "إيقاف التسجيل الصوتي" : "تشغيل التسجيل الصوتي"
					}
					className="w-9 h-9 rounded-full bg-accent hover:bg-accent-mid disabled:opacity-40 disabled:hover:bg-accent text-white flex items-center justify-center shrink-0 transition active:scale-95"
				>
					{isLoading ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : isPlaying ? (
						<Pause className="w-4 h-4 fill-current" />
					) : (
						<Play className="w-4 h-4 fill-current mr-[-1px]" />
					)}
				</button>

				<div>
					<div className="font-medium text-page-raised text-sm flex items-center gap-2 flex-wrap">
						<span>الشيخ {scholar}</span>
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-page-raised/80">
							حلقة #{episodeNumber}
						</span>
					</div>
					<div className="text-[11px] text-page-raised/55 flex items-center gap-1.5 mt-0.5">
						{error || unavailable ? (
							<>
								<AlertCircle className="w-3 h-3 text-rose-300" />
								<span className="text-rose-200/90">
									{unavailable ? "لا يتوفر تسجيل صوتي لهذه الفتوى" : error}
								</span>
							</>
						) : (
							<>
								<Radio className="w-3 h-3" />
								<span>نور على الدرب</span>
							</>
						)}
					</div>
				</div>
			</div>

			<div className="flex-1 w-full max-w-md flex items-center gap-2.5">
				<span className="text-[11px] font-mono text-page-raised/50 tabular-nums">
					{formatTime(currentTime)}
				</span>
				<input
					type="range"
					min={0}
					max={duration || Math.max(initialTimestamp + 1, 1)}
					step={0.25}
					value={Math.min(currentTime, duration || currentTime)}
					onChange={(e) => seek(Number(e.target.value))}
					disabled={unavailable || !hasLoadedSrc || !duration}
					aria-label="موقع المقطع الصوتي"
					className="w-full accent-accent h-1 rounded appearance-none cursor-pointer bg-white/20 disabled:opacity-40"
				/>
				<span className="text-[11px] font-mono text-page-raised/40 tabular-nums">
					{formatTime(duration)}
				</span>
			</div>
		</div>
	);
};
