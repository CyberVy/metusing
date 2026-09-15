import { pitch_controller } from "./pitch.controller"
import { parse_lyrics, type LyricLine } from "../lyrics_parser"
import { generate_demo_song } from "../demo_song"

export type { LyricLine }

export interface SongMetadata {
    video_id: string
    title: string
    artist: string
    duration: number
    has_lyrics: boolean
}

export interface KaraokeSnapshot {
    video_id: string | null
    status: "idle" | "loading" | "ready" | "error"
    error: string | null
    meta: SongMetadata | null
    lyrics: LyricLine[]
    current_time: number
    duration: number
    is_playing: boolean
    track_mode: "instrumental" | "vocals"
    has_vocals: boolean
}

export interface LoadLocalSongOptions {
    instrumental: File | Blob | string
    vocals?: File | Blob | string | null
    lyrics?: string | File | LyricLine[] | null
    meta?: Partial<SongMetadata>
}

export class KaraokeController extends EventTarget {
    private video_id: string | null = null
    private status: KaraokeSnapshot["status"] = "idle"
    private error: string | null = null
    private meta: SongMetadata | null = null
    private lyrics: LyricLine[] = []
    private current_time = 0
    private duration = 0
    private is_playing = false
    private track_mode: "instrumental" | "vocals" = "instrumental"
    private has_vocals = false

    private instrumental_url: string | null = null
    private vocals_url: string | null = null
    private active_object_urls: string[] = []

    private audio_element: HTMLAudioElement | null = null
    private cached_snapshot: KaraokeSnapshot | null = null

    public get_snapshot = (): KaraokeSnapshot => {
        if (!this.cached_snapshot) {
            this.cached_snapshot = {
                video_id: this.video_id,
                status: this.status,
                error: this.error,
                meta: this.meta,
                lyrics: this.lyrics,
                current_time: this.current_time,
                duration: this.duration,
                is_playing: this.is_playing,
                track_mode: this.track_mode,
                has_vocals: this.has_vocals
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

    private cleanup_audio(): void {
        if (this.audio_element) {
            this.audio_element.pause()
            this.audio_element.removeAttribute("src")
            this.audio_element.load()
            this.audio_element = null
        }
        for (const url of this.active_object_urls) {
            URL.revokeObjectURL(url)
        }
        this.active_object_urls = []
        this.instrumental_url = null
        this.vocals_url = null
    }

    public load_local_data = async (options: LoadLocalSongOptions): Promise<void> => {
        this.pause()
        this.cleanup_audio()

        this.status = "loading"
        this.error = null
        this.notify_change()

        try {
            // Instrumental URL
            if (typeof options.instrumental === "string") {
                this.instrumental_url = options.instrumental
            } else {
                const url = URL.createObjectURL(options.instrumental)
                this.active_object_urls.push(url)
                this.instrumental_url = url
            }

            // Vocals URL (optional)
            if (options.vocals) {
                if (typeof options.vocals === "string") {
                    this.vocals_url = options.vocals
                } else {
                    const url = URL.createObjectURL(options.vocals)
                    this.active_object_urls.push(url)
                    this.vocals_url = url
                }
                this.has_vocals = true
            } else {
                this.vocals_url = null
                this.has_vocals = false
            }

            // Parse Lyrics
            if (options.lyrics) {
                if (typeof options.lyrics === "string") {
                    this.lyrics = parse_lyrics(options.lyrics)
                } else if (options.lyrics instanceof File) {
                    const text = await options.lyrics.text()
                    this.lyrics = parse_lyrics(text)
                } else if (Array.isArray(options.lyrics)) {
                    this.lyrics = options.lyrics
                } else {
                    this.lyrics = []
                }
            } else {
                this.lyrics = []
            }

            // Metadata
            const title =
                options.meta?.title ||
                (options.instrumental instanceof File
                    ? options.instrumental.name.replace(/\.[^/.]+$/, "")
                    : "Custom Track")
            const artist = options.meta?.artist || "Local Audio"
            const video_id = options.meta?.video_id || `local-${Date.now()}`

            this.video_id = video_id
            this.meta = {
                video_id,
                title,
                artist,
                duration: 0,
                has_lyrics: this.lyrics.length > 0
            }

            this.track_mode = "instrumental"
            this.current_time = 0
            this.duration = 0

            // Initialize Audio element with instrumental track
            const audio = new Audio(this.instrumental_url)

            audio.addEventListener("loadedmetadata", () => {
                this.duration = audio.duration
                if (this.meta) {
                    this.meta.duration = audio.duration
                }
                this.notify_change()
            })

            audio.addEventListener("ended", () => {
                this.is_playing = false
                this.notify_change()
            })

            audio.addEventListener("timeupdate", () => {
                this.current_time = audio.currentTime
                this.notify_change()
            })

            audio.addEventListener("error", () => {
                this.status = "error"
                this.error = "Failed to load audio format. Please check file format."
                this.notify_change()
            })

            this.audio_element = audio
            this.status = "ready"
            this.notify_change()
        } catch (err) {
            this.status = "error"
            this.error = err instanceof Error ? err.message : "Failed to load local track"
            this.notify_change()
        }
    }

    public load_demo_song = async (): Promise<void> => {
        this.status = "loading"
        this.error = null
        this.notify_change()

        try {
            const demo = await generate_demo_song()
            await this.load_local_data({
                instrumental: demo.instrumental_blob,
                vocals: demo.vocals_blob,
                lyrics: demo.lyrics,
                meta: demo.meta
            })
        } catch (err) {
            this.status = "error"
            this.error = err instanceof Error ? err.message : "Failed to generate demo track"
            this.notify_change()
        }
    }

    public unload_song = (): void => {
        this.pause()
        this.cleanup_audio()
        this.status = "idle"
        this.video_id = null
        this.error = null
        this.meta = null
        this.lyrics = []
        this.current_time = 0
        this.duration = 0
        this.track_mode = "instrumental"
        this.has_vocals = false
        this.notify_change()
    }

    public toggle_track_mode = (): void => {
        if (this.status !== "ready" || !this.audio_element || !this.has_vocals) {
            return
        }

        const next_mode = this.track_mode === "instrumental" ? "vocals" : "instrumental"
        const next_url = next_mode === "instrumental" ? this.instrumental_url : this.vocals_url

        if (!next_url) {
            return
        }

        const saved_time = this.audio_element.currentTime
        const was_playing = this.is_playing

        this.track_mode = next_mode
        this.audio_element.src = next_url
        this.audio_element.currentTime = saved_time

        if (was_playing) {
            void this.audio_element.play()
        }
        this.notify_change()
    }

    public play = async (): Promise<void> => {
        if (!this.audio_element) {
            return
        }
        try {
            await this.audio_element.play()
            this.is_playing = true
            this.notify_change()

            // If ear return is enabled and mic is not active, automatically activate mic for singing
            const pitch_snapshot = pitch_controller.get_snapshot()
            if (pitch_snapshot.is_monitor_enabled && !pitch_snapshot.is_listening) {
                void pitch_controller.start()
            }
        } catch (e) {
            console.error("[KaraokeController] Play failed:", e)
        }
    }

    public pause = (): void => {
        if (this.audio_element) {
            this.audio_element.pause()
        }
        this.is_playing = false
        this.notify_change()
    }

    public toggle_play = (): void => {
        if (this.is_playing) {
            this.pause()
        } else {
            void this.play()
        }
    }

    public seek = (seconds: number): void => {
        if (!this.audio_element) {
            return
        }
        this.audio_element.currentTime = seconds
        this.current_time = seconds
        this.notify_change()
    }
}

export const karaoke_controller = new KaraokeController()
