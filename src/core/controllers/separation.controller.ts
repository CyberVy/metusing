import {
    GpuSeparator,
    load_htdemucs_chain,
    decode_audio_to_stereo,
    audio_channels_to_wav_blob,
    FP16_CPU_NODES,
    type ModelChain,
    type SeparatedStems,
    type StemChannels
} from "../demucs"
import { generate_demo_song } from "../demo_song"

export interface StemAudioData {
    blob: Blob
    url: string
    duration: number
}

export interface SeparationSnapshot {
    status: "idle" | "checking" | "downloading_model" | "initializing" | "separating" | "ready" | "error"
    webgpu_supported: boolean | null
    webgpu_error: string | null
    model_loaded: boolean
    model_progress: number
    model_status_text: string
    separation_progress: number
    current_segment: number
    total_segments: number
    rtf: number | null
    elapsed_seconds: number
    audio_file_name: string | null
    error_message: string | null
    stems: {
        vocals?: StemAudioData
        instrumental?: StemAudioData
        drums?: StemAudioData
        bass?: StemAudioData
        other?: StemAudioData
    } | null
}

export class SeparationController extends EventTarget {
    private status: SeparationSnapshot["status"] = "idle"
    private webgpu_supported: boolean | null = null
    private webgpu_error: string | null = null
    private model_loaded = false
    private model_progress = 0
    private model_status_text = ""
    private separation_progress = 0
    private current_segment = 0
    private total_segments = 0
    private rtf: number | null = null
    private elapsed_seconds = 0
    private audio_file_name: string | null = null
    private error_message: string | null = null
    private stems: SeparationSnapshot["stems"] = null

    private model_chain: ModelChain | null = null
    private separator: GpuSeparator | null = null
    private active_object_urls: string[] = []
    private is_cancelled = false
    private cached_snapshot: SeparationSnapshot | null = null

    public get_snapshot = (): SeparationSnapshot => {
        if (!this.cached_snapshot) {
            this.cached_snapshot = {
                status: this.status,
                webgpu_supported: this.webgpu_supported,
                webgpu_error: this.webgpu_error,
                model_loaded: this.model_loaded,
                model_progress: this.model_progress,
                model_status_text: this.model_status_text,
                separation_progress: this.separation_progress,
                current_segment: this.current_segment,
                total_segments: this.total_segments,
                rtf: this.rtf,
                elapsed_seconds: this.elapsed_seconds,
                audio_file_name: this.audio_file_name,
                error_message: this.error_message,
                stems: this.stems
            }
        }
        return this.cached_snapshot
    }

    public subscribe = (listener: () => void): (() => void) => {
        this.addEventListener("change", listener)
        return () => this.removeEventListener("change", listener)
    }

    private notify_change(): void {
        this.cached_snapshot = null
        this.dispatchEvent(new Event("change"))
    }

    public async check_webgpu(): Promise<boolean> {
        if (this.webgpu_supported !== null) {
            return this.webgpu_supported
        }

        this.status = "checking"
        this.notify_change()

        if (typeof navigator === "undefined" || !navigator.gpu) {
            this.webgpu_supported = false
            this.webgpu_error = "WebGPU is not supported in this browser or context. Note: Safari on iOS requires HTTPS or localhost."
            this.status = "idle"
            this.notify_change()
            return false
        }

        try {
            const adapter = await navigator.gpu.requestAdapter()
            if (!adapter) {
                this.webgpu_supported = false
                this.webgpu_error = "No WebGPU adapter found on this device."
                this.status = "idle"
                this.notify_change()
                return false
            }

            const device = await adapter.requestDevice()
            device.destroy()

            this.webgpu_supported = true
            this.webgpu_error = null
            this.status = "idle"
            this.notify_change()
            return true
        } catch (err) {
            this.webgpu_supported = false
            this.webgpu_error = err instanceof Error ? err.message : String(err)
            this.status = "idle"
            this.notify_change()
            return false
        }
    }

    public async load_model(): Promise<void> {
        if (this.model_loaded && this.separator) return

        const supported = await this.check_webgpu()
        if (!supported) {
            throw new Error(this.webgpu_error || "WebGPU not supported")
        }

        this.status = "downloading_model"
        this.model_progress = 0
        this.model_status_text = "Fetching model manifest..."
        this.notify_change()

        try {
            if (!this.model_chain) {
                this.model_chain = await load_htdemucs_chain((progress) => {
                    this.model_progress = progress.percent
                    if (progress.phase === "manifest") {
                        this.model_status_text = "Loading manifest..."
                    } else if (progress.phase === "downloading") {
                        this.model_status_text = `Downloading weights ${progress.loaded_pieces + 1}/${progress.total_pieces}...`
                    } else if (progress.phase === "ready") {
                        this.model_status_text = "Weights downloaded"
                    }
                    this.notify_change()
                })
            }

            this.status = "initializing"
            this.model_status_text = "Compiling WebGPU shaders & initializing pipeline..."
            this.notify_change()

            const separator = new GpuSeparator({
                session_options: {
                    executionProviders: [{ name: "webgpu", forceCpuNodeNames: FP16_CPU_NODES }]
                },
                gentle: false,
                on_progress: (info) => {
                    this.separation_progress = Math.round(info.progress * 100)
                    this.current_segment = info.current_segment
                    this.total_segments = info.total_segments
                    this.notify_change()
                },
                should_cancel: () => this.is_cancelled
            })

            await separator.init_chain(this.model_chain)
            this.separator = separator
            this.model_loaded = true
            this.status = "idle"
            this.model_status_text = "Model ready"
            this.notify_change()
        } catch (err) {
            this.status = "error"
            this.error_message = err instanceof Error ? err.message : String(err)
            this.notify_change()
            throw err
        }
    }

    public async separate_file(file: File): Promise<void> {
        this.audio_file_name = file.name
        const array_buf = await file.arrayBuffer()
        await this.run_separation(array_buf)
    }

    public async separate_demo(): Promise<void> {
        this.audio_file_name = "Demo Song (Twinkle Star)"
        this.status = "separating"
        this.notify_change()

        const demo = await generate_demo_song()
        await this.run_separation(demo.vocals_blob)
    }

    private async run_separation(data: ArrayBuffer | Blob): Promise<void> {
        this.is_cancelled = false
        this.error_message = null
        this.cleanup_urls()

        try {
            await this.load_model()
            if (!this.separator) throw new Error("Separator failed to initialize")

            this.status = "separating"
            this.separation_progress = 0
            this.current_segment = 0
            this.rtf = null
            this.notify_change()

            const t0 = performance.now()

            // Decode audio
            const audio = await decode_audio_to_stereo(data)
            const raw_stems: SeparatedStems = await this.separator.separate(audio.left, audio.right)

            const elapsed_ms = performance.now() - t0
            const elapsed_sec = elapsed_ms / 1000
            this.elapsed_seconds = Math.round(elapsed_sec * 10) / 10
            this.rtf = Math.round((audio.duration / elapsed_sec) * 10) / 10

            // Convert stems to playable WAV Blobs
            const stem_to_data = (ch: StemChannels): StemAudioData => {
                const blob = audio_channels_to_wav_blob(ch)
                const url = URL.createObjectURL(blob)
                this.active_object_urls.push(url)
                return { blob, url, duration: audio.duration }
            }

            this.stems = {
                vocals: stem_to_data(raw_stems.vocals),
                instrumental: raw_stems.instrumental ? stem_to_data(raw_stems.instrumental) : undefined,
                drums: stem_to_data(raw_stems.drums),
                bass: stem_to_data(raw_stems.bass),
                other: stem_to_data(raw_stems.other)
            }

            this.status = "ready"
            this.separation_progress = 100
            this.notify_change()
        } catch (err) {
            if (this.is_cancelled) {
                this.status = "idle"
                this.error_message = null
            } else {
                this.status = "error"
                this.error_message = err instanceof Error ? err.message : String(err)
            }
            this.notify_change()
        }
    }

    public cancel(): void {
        this.is_cancelled = true
        this.status = "idle"
        this.notify_change()
    }

    public reset(): void {
        this.cancel()
        this.cleanup_urls()
        this.stems = null
        this.audio_file_name = null
        this.status = "idle"
        this.error_message = null
        this.notify_change()
    }

    private cleanup_urls(): void {
        for (const url of this.active_object_urls) {
            URL.revokeObjectURL(url)
        }
        this.active_object_urls = []
    }
}

export const separation_controller = new SeparationController()
