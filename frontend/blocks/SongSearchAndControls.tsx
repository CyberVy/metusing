import { Play, Pause, LoaderCircle, Headphones, Sparkles, Upload, AudioLines, FileText, RefreshCw } from "lucide-react"
import { useState, useRef } from "react"
import { Badge, Button, ListRow, SectionHeader } from "@/components"
import { useKaraokeState, karaoke_controller, usePitchState, pitch_controller, DEMO_SONGS } from "@/core/controllers"
const AUDIO_FILE_ACCEPT = ".mp3,.wav,.m4a,.aac,.aiff"

function format_seconds(secs: number): string {
    if (isNaN(secs) || secs < 0) return "00:00"
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function SongSearchAndControls() {
    const { status, error, meta, current_time, duration, is_playing, track_mode, has_vocals } = useKaraokeState()
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

    const handle_load_demo = async (video_id?: string) => {
        await karaoke_controller.load_demo_song(video_id)
    }

    const is_loading = status === "loading"

    return (
        <div className="flex flex-col gap-4 p-5 bg-zinc-100/80 dark:bg-zinc-900/60 border border-black/10 dark:border-white/10 rounded-xl">
            {/* When not ready: Show upload / demo loader */}
            {status !== "ready" && (
                <div className="flex flex-col gap-4">
                    {/* Demo Songs Selector */}
                    <div className="flex flex-col gap-2.5 p-3.5 bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg">
                        <div className="flex flex-col gap-0.5">
                            <SectionHeader
                                title={
                                    <span className="inline-flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>Demo Songs</span>
                                    </span>
                                }
                                count={DEMO_SONGS.length}
                            />
                            <span className="text-xs text-black/40 dark:text-white/40">
                                Pre-separated accompaniment, vocal tracks, and synchronized lyrics
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-0.5">
                            {DEMO_SONGS.map((song) => (
                                <ListRow
                                    key={song.video_id}
                                    size="sm"
                                    variant="filled"
                                    title={song.title}
                                    subtitle={song.artist}
                                    on_click={() => {
                                        if (!is_loading) {
                                            void handle_load_demo(song.video_id)
                                        }
                                    }}
                                    className={`border border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 ${
                                        is_loading ? "opacity-40 pointer-events-none" : ""
                                    }`}
                                    trailing={
                                        <Button
                                            variant="primary"
                                            size="xs"
                                            shape="rounded"
                                            disabled={is_loading}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                void handle_load_demo(song.video_id)
                                            }}
                                        >
                                            {is_loading ? <LoaderCircle className="w-3 h-3 animate-spin" /> : "Load"}
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
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
                                    <AudioLines className="w-3.5 h-3.5 text-black/40 dark:text-white/50" />
                                    Accompaniment *
                                </span>
                                {inst_file && (
                                    <Badge tone="subtle" mono>
                                        Selected
                                    </Badge>
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
                                    <AudioLines className="w-3.5 h-3.5 text-black/40 dark:text-white/50" />
                                    Vocals (Optional)
                                </span>
                                {vocal_file && (
                                    <Badge tone="subtle" mono>
                                        Selected
                                    </Badge>
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
                                    <FileText className="w-3.5 h-3.5 text-black/40 dark:text-white/50" />
                                    Lyrics (Optional)
                                </span>
                                {lyrics_file && (
                                    <Badge tone="subtle" mono>
                                        Selected
                                    </Badge>
                                )}
                            </div>
                            <span className="text-[11px] text-black/40 dark:text-white/40 truncate">
                                {lyrics_file ? lyrics_file.name : "Select .lrc or .json file"}
                            </span>
                        </div>
                    </div>

                    {/* Submit Custom Upload */}
                    <Button
                        variant="primary"
                        size="md"
                        shape="rounded"
                        onClick={() => void handle_load_custom()}
                        disabled={is_loading || !inst_file}
                        className="w-full font-semibold"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Load Selected Tracks</span>
                        </span>
                    </Button>

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
                        <Button
                            variant="secondary"
                            size="xs"
                            shape="rounded"
                            onClick={() => karaoke_controller.unload_song()}
                            className="shrink-0"
                            title="Unload current track and select another"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <RefreshCw className="w-3 h-3" />
                                <span>Change Track</span>
                            </span>
                        </Button>
                    </div>

                    {/* Track mode & Ear return bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {/* Accompaniment vs Original Vocals */}
                            <div className="flex items-center gap-1 bg-black/5 dark:bg-black/60 p-1 rounded-xl border border-black/10 dark:border-white/10">
                                <Button
                                    variant={track_mode === "instrumental" ? "primary" : "ghost"}
                                    size="xs"
                                    shape="rounded"
                                    onClick={() => {
                                        if (track_mode !== "instrumental") {
                                            karaoke_controller.toggle_track_mode()
                                        }
                                    }}
                                >
                                    Accompaniment
                                </Button>
                                <Button
                                    variant={track_mode === "vocals" ? "primary" : "ghost"}
                                    size="xs"
                                    shape="rounded"
                                    disabled={!has_vocals}
                                    onClick={() => {
                                        if (track_mode !== "vocals" && has_vocals) {
                                            karaoke_controller.toggle_track_mode()
                                        }
                                    }}
                                    title={has_vocals ? "Toggle original vocal track" : "No vocal track loaded"}
                                >
                                    Original Vocals
                                </Button>
                            </div>

                            {/* Ear Return Toggle Button */}
                            <Button
                                variant={is_monitor_enabled ? "primary" : "secondary"}
                                size="xs"
                                shape="rounded"
                                onClick={() => void pitch_controller.toggle_monitor()}
                                title="Toggle microphone ear return for singing"
                                className={is_monitor_enabled ? "border border-transparent" : undefined}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <Headphones className="w-3.5 h-3.5" />
                                    <span>{is_monitor_enabled ? "Ear Return On" : "Ear Return Off"}</span>
                                </span>
                            </Button>
                        </div>

                        {/* Current time / Duration */}
                        <div className="text-xs font-mono text-black/60 dark:text-white/60">
                            {format_seconds(current_time)} / {format_seconds(duration)}
                        </div>
                    </div>

                    {/* Seekbar and Play Button */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="primary"
                            size="auto"
                            shape="pill"
                            aria-label={is_playing ? "Pause" : "Play"}
                            onClick={() => karaoke_controller.toggle_play()}
                            className="size-10 shrink-0"
                        >
                            {is_playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
                        </Button>
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
