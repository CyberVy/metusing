import { Play, Pause, LoaderCircle, Headphones, Sparkles, Upload, AudioLines, FileText, RefreshCw } from "lucide-react"
import { useState, useRef } from "react"
import { Badge, Button, ListRow, SectionHeader, Text } from "@/components"
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
        <div className="flex flex-col gap-4 p-5 bg-ui-fill-subtle border border-ui-border rounded-xl">
            {/* When not ready: Show upload / demo loader */}
            {status !== "ready" && (
                <div className="flex flex-col gap-4">
                    {/* Demo Songs Selector */}
                    <div className="flex flex-col gap-2.5 p-3.5 bg-ui-fill-subtle border border-ui-border rounded-lg">
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
                            <Text variant="caption" tone="tertiary">
                                Pre-separated accompaniment, vocal tracks, and synchronized lyrics
                            </Text>
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
                                    className={`border border-ui-border hover:border-ui-border-strong ${
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
                        <div className="flex-1 h-px bg-ui-border" />
                        <Text variant="footnote" weight="medium" tone="tertiary" className="uppercase tracking-wider">
                            Or Upload Local Files
                        </Text>
                        <div className="flex-1 h-px bg-ui-border" />
                    </div>

                    {/* File pickers grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Accompaniment File */}
                        <div
                            onClick={() => inst_input_ref.current?.click()}
                            className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                inst_file
                                    ? "bg-ui-fill-hover border-ui-border-strong"
                                    : "bg-ui-fill-subtle border-ui-border hover:border-ui-border-hover"
                            }`}
                        >
                            <input
                                ref={inst_input_ref}
                                type="file"
                                accept={AUDIO_FILE_ACCEPT}
                                className="hidden"
                                onChange={(e) => set_inst_file(e.target.files?.[0] || null)}
                            />
                            <div className="flex items-center justify-between">
                                <Text variant="caption" weight="medium" className="flex items-center gap-1.5">
                                    <AudioLines className="w-3.5 h-3.5 text-ui-label-tertiary" />
                                    Accompaniment *
                                </Text>
                                {inst_file && (
                                    <Badge tone="subtle" mono>
                                        Selected
                                    </Badge>
                                )}
                            </div>
                            <Text variant="footnote" tone="tertiary" truncate>
                                {inst_file ? inst_file.name : "Select instrumental (.mp3, .wav)"}
                            </Text>
                        </div>

                        {/* Vocal Track File */}
                        <div
                            onClick={() => vocal_input_ref.current?.click()}
                            className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                vocal_file
                                    ? "bg-ui-fill-hover border-ui-border-strong"
                                    : "bg-ui-fill-subtle border-ui-border hover:border-ui-border-hover"
                            }`}
                        >
                            <input
                                ref={vocal_input_ref}
                                type="file"
                                accept={AUDIO_FILE_ACCEPT}
                                className="hidden"
                                onChange={(e) => set_vocal_file(e.target.files?.[0] || null)}
                            />
                            <div className="flex items-center justify-between">
                                <Text variant="caption" weight="medium" className="flex items-center gap-1.5">
                                    <AudioLines className="w-3.5 h-3.5 text-ui-label-tertiary" />
                                    Vocals (Optional)
                                </Text>
                                {vocal_file && (
                                    <Badge tone="subtle" mono>
                                        Selected
                                    </Badge>
                                )}
                            </div>
                            <Text variant="footnote" tone="tertiary" truncate>
                                {vocal_file ? vocal_file.name : "Select vocal track"}
                            </Text>
                        </div>

                        {/* Lyrics File */}
                        <div
                            onClick={() => lyrics_input_ref.current?.click()}
                            className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                lyrics_file
                                    ? "bg-ui-fill-hover border-ui-border-strong"
                                    : "bg-ui-fill-subtle border-ui-border hover:border-ui-border-hover"
                            }`}
                        >
                            <input
                                ref={lyrics_input_ref}
                                type="file"
                                accept=".lrc,.json,text/plain"
                                className="hidden"
                                onChange={(e) => set_lyrics_file(e.target.files?.[0] || null)}
                            />
                            <div className="flex items-center justify-between">
                                <Text variant="caption" weight="medium" className="flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-ui-label-tertiary" />
                                    Lyrics (Optional)
                                </Text>
                                {lyrics_file && (
                                    <Badge tone="subtle" mono>
                                        Selected
                                    </Badge>
                                )}
                            </div>
                            <Text variant="footnote" tone="tertiary" truncate>
                                {lyrics_file ? lyrics_file.name : "Select .lrc or .json file"}
                            </Text>
                        </div>
                    </div>

                    {/* Submit Custom Upload */}
                    <Button
                        variant="primary"
                        size="md"
                        shape="rounded"
                        onClick={() => void handle_load_custom()}
                        disabled={is_loading || !inst_file}
                        className="w-full"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Upload className="w-3.5 h-3.5" />
                            <Text variant="body" weight="semibold" tone="inherit">
                                Load Selected Tracks
                            </Text>
                        </span>
                    </Button>

                    {/* Error display */}
                    {status === "error" && error && (
                        <Text
                            as="div"
                            variant="caption"
                            className="p-2.5 rounded bg-red-950/20 border border-ui-border"
                        >
                            {error}
                        </Text>
                    )}
                </div>
            )}

            {/* When ready: Active playback controls */}
            {status === "ready" && (
                <div className="flex flex-col gap-4">
                    {/* Song info & Replace button */}
                    <div className="flex items-center justify-between pb-2 border-b border-ui-border">
                        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                            <Text variant="caption" weight="semibold" truncate>
                                {meta?.title || "Custom Track"}
                            </Text>
                            <Text variant="caption" tone="tertiary" truncate>
                                {meta?.artist || "Local Audio"}
                            </Text>
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
                                <Text variant="caption" weight="medium" tone="inherit">
                                    Change Track
                                </Text>
                            </span>
                        </Button>
                    </div>

                    {/* Track mode & Ear return bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {/* Accompaniment vs Original Vocals */}
                            <div className="flex items-center gap-1 bg-ui-fill-subtle p-1 rounded-xl border border-ui-border">
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
                                    <Text variant="caption" weight="medium" tone="inherit">
                                        {is_monitor_enabled ? "Ear Return On" : "Ear Return Off"}
                                    </Text>
                                </span>
                            </Button>
                        </div>

                        {/* Current time / Duration */}
                        <Text as="div" variant="caption" tone="secondary" mono>
                            {format_seconds(current_time)} / {format_seconds(duration)}
                        </Text>
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
                            className="flex-1 accent-ui-fill-solid h-1.5 bg-ui-fill-active rounded-lg cursor-pointer"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
