import { useEffect, useRef } from "react"
import { useSeparationState, separation_controller } from "@/core/controllers"
import { LayersIcon, CpuIcon, SparklesIcon, RefreshCwIcon } from "./icons"

export function SeparationView() {
    const {
        status,
        webgpu_supported,
        webgpu_error,
        model_loaded,
        model_progress,
        model_status_text,
        separation_progress,
        current_segment,
        total_segments,
        rtf,
        elapsed_seconds,
        audio_file_name,
        error_message,
        stems
    } = useSeparationState()

    const file_input_ref = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        void separation_controller.check_webgpu()
    }, [])

    const handle_file_select = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            void separation_controller.separate_file(file)
        }
        if (file_input_ref.current) {
            file_input_ref.current.value = ""
        }
    }

    const handle_drop = (e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (file) {
            void separation_controller.separate_file(file)
        }
    }

    const is_busy = status === "downloading_model" || status === "initializing" || status === "separating"

    return (
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex flex-col gap-6 select-none">
            {/* Card: Header & WebGPU Status */}
            <div className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center">
                            <LayersIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-black dark:text-white">Demucs WebGPU Stems</h2>
                            <p className="text-xs text-black/50 dark:text-white/50">
                                4-Stem / Karaoke Separation (Chained 21-Piece WebGPU Pipeline)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                        <CpuIcon className="w-3.5 h-3.5" />
                        <span>
                            {webgpu_supported === null
                                ? "Checking..."
                                : webgpu_supported
                                  ? "WebGPU Ready"
                                  : "WebGPU Unavailable"}
                        </span>
                    </div>
                </div>

                {webgpu_error && (
                    <div className="text-xs text-black/70 dark:text-white/70 bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-black/10 dark:border-white/10">
                        {webgpu_error}
                    </div>
                )}
            </div>

            {/* Card: Upload & Demo Actions */}
            {!is_busy && !stems && (
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handle_drop}
                    className="p-8 rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 flex flex-col items-center justify-center text-center gap-4 hover:border-black/30 dark:hover:border-white/30 transition-colors"
                >
                    <input
                        ref={file_input_ref}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handle_file_select}
                    />

                    <div className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-black/60 dark:text-white/60">
                        <LayersIcon className="w-6 h-6" />
                    </div>

                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-black dark:text-white">
                            Drag and drop an audio file here, or click to upload
                        </p>
                        <p className="text-xs text-black/40 dark:text-white/40">
                            Supports MP3, WAV, AAC, M4A, FLAC (Resampled to 44.1kHz stereo)
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        <button
                            type="button"
                            onClick={() => file_input_ref.current?.click()}
                            disabled={!webgpu_supported}
                            className="px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-medium hover:opacity-90 active:scale-98 transition disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                            Select Audio File
                        </button>
                        <button
                            type="button"
                            onClick={() => void separation_controller.separate_demo()}
                            disabled={!webgpu_supported}
                            className="px-4 py-2 rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white text-xs font-medium hover:bg-black/15 dark:hover:bg-white/15 active:scale-98 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span>Try Demo Song (30s)</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Card: Processing Progress */}
            {is_busy && (
                <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center animate-spin">
                                <RefreshCwIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-black dark:text-white">
                                    {status === "downloading_model"
                                        ? "Downloading Model Weights"
                                        : status === "initializing"
                                          ? "Compiling WebGPU Kernels"
                                          : "Separating Audio Stems"}
                                </h3>
                                <p className="text-xs text-black/50 dark:text-white/50">
                                    {audio_file_name ?? model_status_text}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => separation_controller.cancel()}
                            className="text-xs px-2.5 py-1 rounded bg-black/10 dark:bg-white/10 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white transition cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex flex-col gap-1.5">
                        <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div
                                className="h-full bg-black dark:bg-white transition-all duration-200"
                                style={{
                                    width: `${status === "separating" ? separation_progress : model_progress}%`
                                }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-black/50 dark:text-white/50 font-mono">
                            <span>
                                {status === "separating"
                                    ? `Chunk ${current_segment} / ${total_segments} (7.8s window)`
                                    : model_status_text}
                            </span>
                            <span>{status === "separating" ? `${separation_progress}%` : `${model_progress}%`}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error_message && (
                <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/15 dark:border-white/15 text-xs text-black/80 dark:text-white/80 flex flex-col gap-2">
                    <p className="font-semibold">Separation Failed</p>
                    <p className="font-mono text-xs">{error_message}</p>
                    <button
                        type="button"
                        onClick={() => separation_controller.reset()}
                        className="self-start mt-2 px-3 py-1.5 rounded bg-black text-white dark:bg-white dark:text-black text-xs font-medium cursor-pointer"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {/* Card: Stems Output */}
            {stems && (
                <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex flex-col gap-5">
                    <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
                        <div>
                            <h3 className="text-sm font-semibold text-black dark:text-white">Separation Complete</h3>
                            <p className="text-xs text-black/50 dark:text-white/50 font-mono">
                                {audio_file_name} • {elapsed_seconds}s elapsed • {rtf}x realtime
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => separation_controller.reset()}
                            className="px-3 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 text-xs font-medium text-black dark:text-white hover:bg-black/15 dark:hover:bg-white/15 transition cursor-pointer"
                        >
                            Separate Another
                        </button>
                    </div>

                    <div className="flex flex-col gap-4">
                        {/* Vocals Track */}
                        {stems.vocals && (
                            <StemRow title="Vocals (Isolated Voice)" url={stems.vocals.url} file_name="vocals.wav" />
                        )}

                        {/* Instrumental Track */}
                        {stems.instrumental && (
                            <StemRow
                                title="Instrumental (Karaoke Accompaniment)"
                                url={stems.instrumental.url}
                                file_name="instrumental.wav"
                            />
                        )}

                        {/* Drums Track */}
                        {stems.drums && (
                            <StemRow title="Drums" url={stems.drums.url} file_name="drums.wav" />
                        )}

                        {/* Bass Track */}
                        {stems.bass && (
                            <StemRow title="Bass" url={stems.bass.url} file_name="bass.wav" />
                        )}

                        {/* Other Track */}
                        {stems.other && (
                            <StemRow title="Other Instruments" url={stems.other.url} file_name="other.wav" />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

interface StemRowProps {
    title: string
    url: string
    file_name: string
}

function StemRow({ title, url, file_name }: StemRowProps) {
    return (
        <div className="p-3.5 rounded-xl bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col">
                <span className="text-xs font-medium text-black dark:text-white">{title}</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <audio controls src={url} className="h-8 max-w-64" />
                <a
                    href={url}
                    download={file_name}
                    className="px-2.5 py-1.5 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-medium text-black dark:text-white transition whitespace-nowrap"
                >
                    Download
                </a>
            </div>
        </div>
    )
}
