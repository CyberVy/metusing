import { useState, useRef } from "react"
import { useKaraokeState, karaoke_controller, usePitchState, pitch_controller } from "@/core/controllers"
import {
    PlayIcon,
    PauseIcon,
    LoaderIcon,
    HeadphonesIcon,
    SparklesIcon,
    UploadIcon,
    FileAudioIcon,
    FileTextIcon,
    RefreshCwIcon
} from "./icons"

const AUDIO_FILE_ACCEPT = ".mp3,.wav,.m4a,.aac,.aiff"

function format_seconds(secs: number): string {
    if (isNaN(secs) || secs < 0) return "00:00"
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function SongSearchAndControls() {
    const {
        status,
        error,
        meta,
        current_time,
        duration,
        is_playing,
        track_mode,
        has_vocals
    } = useKaraokeState()
    const { is_monitor_enabled } = usePitchState()

    const [inst_file, set_inst_file] = useState<File | null>(null)
    const [vocal_file, set_vocal_file] = useState<File | null>(null)
    const [lyrics_file, set_lyrics_file] = useState<File | null>(null)

    const inst_input_ref = useRef<HTMLInputElement | null>(null)
    const vocal_input_ref = useRef<HTMLInputElement | null>(null)
    const lyrics_input_ref = useRef<HTMLInputElement | null>(null)

    const handle_load_custom = async () => {
        if (!inst_file) return
        await karaoke_controller.load_local_data({
            instrumental: inst_file,
            vocals: vocal_file,
            lyrics: lyrics_file
        })
    }

    const handle_load_demo = async () => {
        await karaoke_controller.load_demo_song()
    }

    const is_loading = status === "loading"

    return (
        <div className="flex flex-col gap-4 p-5 bg-zinc-100/80 dark:bg-zinc-900/60 border border-black/10 dark:border-white/10 rounded-xl">
            {/* When not ready: Show upload / demo loader */}
            {status !== "ready" && (
                <div className="flex flex-col gap-4">
                    {/* Quick 1-click Demo Button */}
                    <div className="flex items-center justify-between p-3.5 bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-black dark:text-white">
                                Instant Demo Track
                            </span>
                            <span className="text-xs text-black/40 dark:text-white/40">
                                Synthesized accompaniment, guide vocal, and lyrics (zero file required)
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handle_load_demo()}
                            disabled={is_loading}
                            className="px-3.5 py-1.5 bg-black text-white dark:bg-white dark:text-black text-xs font-semibold rounded-lg hover:bg-black/80 dark:hover:bg-white/90 disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
                        >
                            {is_loading ? (
                                <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <SparklesIcon className="w-3.5 h-3.5" />
                            )}
                            <span>{is_loading ? "Generating..." : "Load Demo Song"}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                        <span className="text-[11px] uppercase tracking-wider text-black/30 dark:text-white/30 font-medium">
                            Or Upload Local Files
                        </span>
                        <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                    </div>

                    {/* File pickers grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Accompaniment File */}
                        <div
                            onClick={() => inst_input_ref.current?.click()}
                            className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                inst_file
                                    ? "bg-black/10 dark:bg-white/10 border-black/30 dark:border-white/30"
                                    : "bg-black/5 dark:bg-black/30 border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                            }`}
                        >
                            <input
                                ref={inst_input_ref}
                                type="file"
                                accept={AUDIO_FILE_ACCEPT}
                                className="hidden"
                                onChange={(e) => set_inst_file(e.target.files?.[0] || null)}
                            />
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-black/70 dark:text-white/80 flex items-center gap-1.5">
                                    <FileAudioIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/50" />
                                    Accompaniment *
                                </span>
                                {inst_file && (
                                    <span className="text-[10px] text-black/40 dark:text-white/40 font-mono">Selected</span>
                                )}
                            </div>
                            <span className="text-[11px] text-black/40 dark:text-white/40 truncate">
                                {inst_file ? inst_file.name : "Select instrumental (.mp3, .wav)"}
                            </span>
                        </div>

                        {/* Vocal Track File */}
                        <div
                            onClick={() => vocal_input_ref.current?.click()}
                            className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                vocal_file
                                    ? "bg-black/10 dark:bg-white/10 border-black/30 dark:border-white/30"
                                    : "bg-black/5 dark:bg-black/30 border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                            }`}
                        >
                            <input
                                ref={vocal_input_ref}
                                type="file"
                                accept={AUDIO_FILE_ACCEPT}
                                className="hidden"
                                onChange={(e) => set_vocal_file(e.target.files?.[0] || null)}
                            />
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-black/70 dark:text-white/80 flex items-center gap-1.5">
                                    <FileAudioIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/50" />
                                    Vocals (Optional)
                                </span>
                                {vocal_file && (
                                    <span className="text-[10px] text-black/40 dark:text-white/40 font-mono">Selected</span>
                                )}
                            </div>
                            <span className="text-[11px] text-black/40 dark:text-white/40 truncate">
                                {vocal_file ? vocal_file.name : "Select vocal track"}
                            </span>
                        </div>

                        {/* Lyrics File */}
                        <div
                            onClick={() => lyrics_input_ref.current?.click()}
                            className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                lyrics_file
                                    ? "bg-black/10 dark:bg-white/10 border-black/30 dark:border-white/30"
                                    : "bg-black/5 dark:bg-black/30 border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                            }`}
                        >
                            <input
                                ref={lyrics_input_ref}
                                type="file"
                                accept=".lrc,.json,text/plain"
                                className="hidden"
                                onChange={(e) => set_lyrics_file(e.target.files?.[0] || null)}
                            />
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-black/70 dark:text-white/80 flex items-center gap-1.5">
                                    <FileTextIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/50" />
                                    Lyrics (Optional)
                                </span>
                                {lyrics_file && (
                                    <span className="text-[10px] text-black/40 dark:text-white/40 font-mono">Selected</span>
                                )}
                            </div>
                            <span className="text-[11px] text-black/40 dark:text-white/40 truncate">
                                {lyrics_file ? lyrics_file.name : "Select .lrc or .json file"}
                            </span>
                        </div>
                    </div>

                    {/* Submit Custom Upload */}
                    <button
                        type="button"
                        onClick={() => void handle_load_custom()}
                        disabled={is_loading || !inst_file}
                        className="w-full py-2.5 bg-black text-white dark:bg-white dark:text-black text-xs font-semibold rounded-lg hover:bg-black/80 dark:hover:bg-white/90 disabled:opacity-30 transition-colors flex items-center justify-center gap-2"
                    >
                        <UploadIcon className="w-3.5 h-3.5" />
                        <span>Load Selected Tracks</span>
                    </button>

                    {/* Error display */}
                    {status === "error" && error && (
                        <div className="p-2.5 rounded bg-red-950/20 border border-black/10 dark:border-white/10 text-xs text-black/70 dark:text-white/80">
                            {error}
                        </div>
                    )}
                </div>
            )}

            {/* When ready: Active playback controls */}
            {status === "ready" && (
                <div className="flex flex-col gap-4">
                    {/* Song info & Replace button */}
                    <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10 text-xs">
                        <div className="flex flex-col gap-0.5 truncate pr-2">
                            <span className="font-semibold text-black dark:text-white truncate">
                                {meta?.title || "Custom Track"}
                            </span>
                            <span className="text-black/40 dark:text-white/40 truncate">
                                {meta?.artist || "Local Audio"}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => karaoke_controller.unload_song()}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white bg-black/5 dark:bg-black/40 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition-colors shrink-0"
                            title="Unload current track and select another"
                        >
                            <RefreshCwIcon className="w-3 h-3" />
                            <span>Change Track</span>
                        </button>
                    </div>

                    {/* Track mode & Ear return bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {/* Accompaniment vs Original Vocals */}
                            <div className="flex items-center gap-1 bg-black/5 dark:bg-black/60 p-1 rounded-lg border border-black/10 dark:border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (track_mode !== "instrumental") {
                                            karaoke_controller.toggle_track_mode()
                                        }
                                    }}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                        track_mode === "instrumental"
                                            ? "bg-black text-white dark:bg-white dark:text-black"
                                            : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                                    }`}
                                >
                                    Accompaniment
                                </button>
                                <button
                                    type="button"
                                    disabled={!has_vocals}
                                    onClick={() => {
                                        if (track_mode !== "vocals" && has_vocals) {
                                            karaoke_controller.toggle_track_mode()
                                        }
                                    }}
                                    title={has_vocals ? "Toggle original vocal track" : "No vocal track loaded"}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                        track_mode === "vocals"
                                            ? "bg-black text-white dark:bg-white dark:text-black"
                                            : has_vocals
                                              ? "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                                              : "text-black/30 dark:text-white/20 cursor-not-allowed"
                                    }`}
                                >
                                    Original Vocals
                                </button>
                            </div>

                            {/* Ear Return Toggle Button */}
                            <button
                                type="button"
                                onClick={() => void pitch_controller.toggle_monitor()}
                                title="Toggle microphone ear return for singing"
                                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                                    is_monitor_enabled
                                        ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                                        : "bg-black/5 dark:bg-black/60 text-black/60 dark:text-white/60 border-black/10 dark:border-white/10 hover:text-black dark:hover:text-white"
                                }`}
                            >
                                <HeadphonesIcon className="w-3.5 h-3.5" />
                                <span>{is_monitor_enabled ? "Ear Return On" : "Ear Return Off"}</span>
                            </button>
                        </div>

                        {/* Current time / Duration */}
                        <div className="text-xs font-mono text-black/60 dark:text-white/60">
                            {format_seconds(current_time)} / {format_seconds(duration)}
                        </div>
                    </div>

                    {/* Seekbar and Play Button */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => karaoke_controller.toggle_play()}
                            className="w-10 h-10 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center hover:bg-black/80 dark:hover:bg-white/90 transition-colors shrink-0"
                        >
                            {is_playing ? (
                                <PauseIcon className="w-4 h-4" />
                            ) : (
                                <PlayIcon className="w-4 h-4 translate-x-0.5" />
                            )}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            step={0.1}
                            value={current_time}
                            onChange={(e) => karaoke_controller.seek(parseFloat(e.target.value))}
                            className="flex-1 accent-black dark:accent-white h-1.5 bg-black/10 dark:bg-white/20 rounded-lg cursor-pointer"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
