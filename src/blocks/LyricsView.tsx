import { useCallback } from "react"
import { useKaraokeState } from "@/core/controllers"
import { SongSearchAndControls } from "./SongSearchAndControls"

export function LyricsList() {
    const { lyrics, current_time, status } = useKaraokeState()
    const lyrics_batch_id = get_lyrics_batch_id(lyrics)

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
    const attach_active_line = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            node.scrollIntoView({
                behavior: "smooth",
                block: "center"
            })
        }
    }, [])

    // Re-center active lyric when a hidden keep-alive tab becomes visible again
    const attach_container = useCallback((node: HTMLDivElement | null) => {
        if (!node) return

        let prev_height = node.getBoundingClientRect().height
        const scroll_active_into_view = () => {
            const active_line = node.querySelector<HTMLElement>("[data-active-lyric='true']")
            if (active_line) {
                active_line.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                })
            }
        }

        if (prev_height > 0) {
            scroll_active_into_view()
        }

        if (typeof ResizeObserver === "undefined") return

        const observer = new ResizeObserver((entries) => {
            const next_height = entries[0]?.contentRect.height ?? node.getBoundingClientRect().height
            if (prev_height === 0 && next_height > 0) {
                scroll_active_into_view()
            }
            prev_height = next_height
        })
        observer.observe(node)

        return () => {
            observer.disconnect()
        }
    }, [])

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
            ref={attach_container}
            className="flex-1 min-h-75 max-h-105 overflow-y-auto px-4 py-8 flex flex-col items-center gap-6 scrollbar-none select-none"
        >
            {lyrics.map((line, idx) => {
                const is_active = idx === active_index
                return (
                    <div
                        key={`${lyrics_batch_id}-${line.start}-${idx}`}
                        ref={is_active ? attach_active_line : null}
                        data-active-lyric={is_active ? "true" : undefined}
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

let next_lyrics_batch_id = 0
const lyrics_batch_ids = new WeakMap<object, number>()

function get_lyrics_batch_id(lyrics: object): number {
    let batch_id = lyrics_batch_ids.get(lyrics)
    if (batch_id === undefined) {
        batch_id = ++next_lyrics_batch_id
        lyrics_batch_ids.set(lyrics, batch_id)
    }
    return batch_id
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
