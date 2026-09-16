import { useEffect, useRef } from "react"
import { useKaraokeState } from "@/core/controllers"
import { SongSearchAndControls } from "./SongSearchAndControls"

export function LyricsList() {
    const { lyrics, current_time, status } = useKaraokeState()
    const active_line_ref = useRef<HTMLDivElement | null>(null)
    const container_ref = useRef<HTMLDivElement | null>(null)

    // Find current active index
    let active_index = -1
    for (let i = 0; i < lyrics.length; i++) {
        const line = lyrics[i]
        if (current_time >= line.start && current_time <= line.end) {
            active_index = i
            break
        } else if (current_time < line.start && active_index === -1 && i > 0) {
            active_index = i - 1
            break
        }
    }

    // Scroll active lyric to center of view
    useEffect(() => {
        if (active_line_ref.current && container_ref.current) {
            active_line_ref.current.scrollIntoView({
                behavior: "smooth",
                block: "center"
            })
        }
    }, [active_index])

    if (status === "loading") {
        return (
            <div className="flex-1 min-h-75 flex items-center justify-center p-8 text-center text-sm text-black/40 dark:text-white/40">
                Loading audio and lyrics...
            </div>
        )
    }

    if (lyrics.length === 0) {
        return (
            <div className="flex-1 min-h-75 flex items-center justify-center p-8 text-center text-sm text-black/40 dark:text-white/40">
                {status === "ready"
                    ? "No synchronized lyrics provided for this track"
                    : "Load the demo track or upload local files to begin"}
            </div>
        )
    }

    return (
        <div
            ref={container_ref}
            className="flex-1 min-h-75 max-h-105 overflow-y-auto px-4 py-8 flex flex-col items-center gap-6 scrollbar-none select-none"
        >
            {lyrics.map((line, idx) => {
                const is_active = idx === active_index
                return (
                    <div
                        key={`${line.start}-${idx}`}
                        ref={is_active ? active_line_ref : null}
                        className={`text-center transition-all duration-300 max-w-lg ${
                            is_active
                                ? "text-xl font-bold text-black dark:text-white scale-105"
                                : "text-base text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60"
                        }`}
                    >
                        {line.text}
                    </div>
                )
            })}
        </div>
    )
}

export function LyricsView() {
    return (
        <div className="flex flex-col gap-5 w-full px-4">
            {/* Audio Extractor & Player Controls */}
            <section>
                <SongSearchAndControls />
            </section>

            {/* Synchronized Lyrics Container */}
            <section className="bg-zinc-100/80 dark:bg-zinc-900/40 border border-black/10 dark:border-white/10 rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 border-b border-black/5 dark:border-white/5 text-xs font-medium text-black/40 dark:text-white/40 uppercase tracking-wider">
                    Synchronized Lyrics
                </div>
                <LyricsList />
            </section>
        </div>
    )
}

export const SingView = LyricsView
export const KaraokeView = LyricsView
