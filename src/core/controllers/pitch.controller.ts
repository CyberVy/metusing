import { extract_pitch_autocorrelation, type PitchDetectionResult } from "../pitch_extractor"

export interface PitchPoint {
    time: number
    pitch_hz: number
    note_name: string
}

export interface AudioInputDevice {
    device_id: string
    label: string
}

export type ChannelMode = "mono" | "stereo" | "left" | "right"

export interface PitchSnapshot {
    is_listening: boolean
    is_monitor_enabled: boolean
    monitor_volume: number
    selected_device_id: string | null
    audio_input_devices: AudioInputDevice[]
    channel_mode: ChannelMode
    current_pitch: number | null
    current_note: string | null
    current_cents: number
    clarity: number
    error_message: string | null
}

export class PitchController extends EventTarget {
    private is_listening = false
    private is_monitor_enabled = false
    private monitor_volume = 0.8
    private selected_device_id: string | null = null
    private audio_input_devices: AudioInputDevice[] = []
    private channel_mode: ChannelMode = "mono"
    private current_pitch: number | null = null
    private current_note: string | null = null
    private current_cents = 0
    private clarity = 0
    private error_message: string | null = null

    // Real-time pitch points for direct Canvas rendering
    private pitch_history: PitchPoint[] = []

    private audio_context: AudioContext | null = null
    private media_stream: MediaStream | null = null
    private analyser: AnalyserNode | null = null
    private monitor_gain_node: GainNode | null = null
    private channel_splitter: ChannelSplitterNode | null = null
    private channel_merger: ChannelMergerNode | null = null
    private animation_frame_id: number | null = null
    private buffer: Float32Array = new Float32Array(2048)

    // Throttling and stability filters
    private last_notify_time = 0
    private silence_start_time = 0
    private consecutive_detected_frames = 0
    private pending_result: PitchDetectionResult | null = null

    private cached_snapshot: PitchSnapshot | null = null

    constructor() {
        super()
        try {
            const saved_vol = localStorage.getItem("metusing_monitor_volume")
            if (saved_vol !== null) {
                const parsed = parseFloat(saved_vol)
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                    this.monitor_volume = parsed
                }
            }
            const saved_enabled = localStorage.getItem("metusing_monitor_enabled")
            if (saved_enabled !== null) {
                this.is_monitor_enabled = saved_enabled === "true"
            }
            const saved_device = localStorage.getItem("metusing_selected_audio_input")
            if (saved_device) {
                this.selected_device_id = saved_device
            }
            const saved_mode = localStorage.getItem("metusing_channel_mode")
            if (saved_mode === "mono" || saved_mode === "stereo" || saved_mode === "left" || saved_mode === "right") {
                this.channel_mode = saved_mode
            }
        } catch {
            // ignore localStorage error in restricted or SSR environments
        }

        if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener("devicechange", () => {
                void this.update_devices()
            })
        }

        void this.update_devices()
    }

    public get_snapshot = (): PitchSnapshot => {
        if (!this.cached_snapshot) {
            this.cached_snapshot = {
                is_listening: this.is_listening,
                is_monitor_enabled: this.is_monitor_enabled,
                monitor_volume: this.monitor_volume,
                selected_device_id: this.selected_device_id,
                audio_input_devices: this.audio_input_devices,
                channel_mode: this.channel_mode,
                current_pitch: this.current_pitch,
                current_note: this.current_note,
                current_cents: this.current_cents,
                clarity: this.clarity,
                error_message: this.error_message
            }
        }
        return this.cached_snapshot
    }

    public get_pitch_history = (): readonly PitchPoint[] => {
        return this.pitch_history
    }

    public subscribe = (listener: () => void): (() => void) => {
        this.addEventListener("change", listener)
        return () => this.removeEventListener("change", listener)
    }

    private notify_change(): void {
        this.cached_snapshot = null
        this.dispatchEvent(new Event("change"))
    }

    public update_devices = async (): Promise<void> => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
            return
        }
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const audio_inputs: AudioInputDevice[] = []
            const seen = new Set<string>()

            for (const d of devices) {
                if (d.kind === "audioinput" && !seen.has(d.deviceId)) {
                    seen.add(d.deviceId)
                    let label = d.label
                    if (!label) {
                        label = d.deviceId === "default" ? "Default Microphone" : `Microphone ${audio_inputs.length + 1}`
                    }
                    audio_inputs.push({
                        device_id: d.deviceId,
                        label
                    })
                }
            }

            this.audio_input_devices = audio_inputs

            if (!this.selected_device_id && audio_inputs.length > 0) {
                this.selected_device_id = audio_inputs[0].device_id
            } else if (this.selected_device_id && !audio_inputs.some((d) => d.device_id === this.selected_device_id)) {
                if (audio_inputs.length > 0) {
                    this.selected_device_id = audio_inputs[0].device_id
                }
            }

            this.notify_change()
        } catch (err) {
            console.warn("[PitchController] Failed to enumerate devices:", err)
        }
    }

    public select_device = async (device_id: string): Promise<void> => {
        if (this.selected_device_id === device_id) {
            return
        }
        this.selected_device_id = device_id
        try {
            localStorage.setItem("metusing_selected_audio_input", device_id)
        } catch {
            // ignore
        }
        this.notify_change()

        if (this.is_listening) {
            this.stop()
            await this.start()
        }
    }

    public start = async (): Promise<void> => {
        if (this.is_listening) {
            return
        }

        try {
            this.error_message = null

            const audio_constraints: MediaTrackConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }

            if (this.selected_device_id && this.selected_device_id !== "default") {
                audio_constraints.deviceId = { exact: this.selected_device_id }
            }

            let stream: MediaStream
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: audio_constraints
                })
            } catch (err) {
                if (this.selected_device_id && this.selected_device_id !== "default") {
                    console.warn("[PitchController] Selected device unavailable, falling back to default:", err)
                    this.selected_device_id = null
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false
                        }
                    })
                } else {
                    throw err
                }
            }

            const active_track = stream.getAudioTracks()[0]
            if (active_track) {
                const settings = active_track.getSettings()
                if (settings.deviceId && !this.selected_device_id) {
                    this.selected_device_id = settings.deviceId
                }
            }

            const audio_ctx_class = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            const ctx = new audio_ctx_class({ latencyHint: "interactive" })
            if (ctx.state === "suspended") {
                await ctx.resume()
            }

            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 2048

            // Channel splitter & merger for flexible channel routing (mono center, stereo, left/right)
            const splitter = ctx.createChannelSplitter(2)
            const merger = ctx.createChannelMerger(2)
            source.connect(splitter)

            this.channel_splitter = splitter
            this.channel_merger = merger
            this.apply_channel_routing()

            // Setup ear return (audio monitor) routing
            const monitor_gain = ctx.createGain()
            monitor_gain.gain.value = this.is_monitor_enabled ? this.monitor_volume : 0
            merger.connect(monitor_gain)
            monitor_gain.connect(ctx.destination)

            // Feed routed vocal signal to analyser for robust pitch detection
            merger.connect(analyser)

            this.audio_context = ctx
            this.media_stream = stream
            this.analyser = analyser
            this.monitor_gain_node = monitor_gain
            this.is_listening = true
            this.pitch_history = []
            this.buffer = new Float32Array(analyser.fftSize)

            // Re-enumerate devices now that mic permission is granted (to unlock real labels)
            void this.update_devices()

            this.notify_change()
            this.run_loop()
        } catch (err) {
            this.error_message = err instanceof Error ? err.message : "Failed to access microphone"
            this.is_listening = false
            this.notify_change()
        }
    }

    public set_monitor_enabled = async (enabled: boolean): Promise<void> => {
        this.is_monitor_enabled = enabled
        try {
            localStorage.setItem("metusing_monitor_enabled", enabled ? "true" : "false")
        } catch {
            // ignore
        }

        if (enabled && !this.is_listening) {
            await this.start()
            return
        }

        if (this.monitor_gain_node && this.audio_context) {
            const target_val = enabled ? this.monitor_volume : 0
            this.monitor_gain_node.gain.setTargetAtTime(
                target_val,
                this.audio_context.currentTime,
                0.015
            )
        }
        this.notify_change()
    }

    public toggle_monitor = async (): Promise<void> => {
        await this.set_monitor_enabled(!this.is_monitor_enabled)
    }

    public set_monitor_volume = (volume: number): void => {
        const clamped = Math.max(0, Math.min(1, Math.round(volume * 100) / 100))
        this.monitor_volume = clamped
        try {
            localStorage.setItem("metusing_monitor_volume", clamped.toString())
        } catch {
            // ignore
        }
        if (this.monitor_gain_node && this.audio_context && this.is_monitor_enabled) {
            this.monitor_gain_node.gain.setTargetAtTime(
                clamped,
                this.audio_context.currentTime,
                0.015
            )
        }
        this.notify_change()
    }

    public set_channel_mode = (mode: ChannelMode): void => {
        if (this.channel_mode === mode) {
            return
        }
        this.channel_mode = mode
        try {
            localStorage.setItem("metusing_channel_mode", mode)
        } catch {
            // ignore
        }
        this.apply_channel_routing()
        this.notify_change()
    }

    private apply_channel_routing = (): void => {
        if (!this.channel_splitter || !this.channel_merger) {
            return
        }

        try {
            this.channel_splitter.disconnect()
        } catch {
            // ignore
        }

        switch (this.channel_mode) {
            case "left":
                // Route Left (Channel 1 / Input 1) to both Left and Right output
                this.channel_splitter.connect(this.channel_merger, 0, 0)
                this.channel_splitter.connect(this.channel_merger, 0, 1)
                break
            case "right":
                // Route Right (Channel 2 / Input 2) to both Left and Right output
                this.channel_splitter.connect(this.channel_merger, 1, 0)
                this.channel_splitter.connect(this.channel_merger, 1, 1)
                break
            case "stereo":
                // Pass-through stereo: 0 -> 0 (L), 1 -> 1 (R)
                this.channel_splitter.connect(this.channel_merger, 0, 0)
                this.channel_splitter.connect(this.channel_merger, 1, 1)
                break
            case "mono":
            default:
                // Dual-mono center: route both inputs to both outputs
                this.channel_splitter.connect(this.channel_merger, 0, 0)
                this.channel_splitter.connect(this.channel_merger, 0, 1)
                this.channel_splitter.connect(this.channel_merger, 1, 0)
                this.channel_splitter.connect(this.channel_merger, 1, 1)
                break
        }
    }

    public stop = (): void => {
        if (!this.is_listening) {
            return
        }

        if (this.animation_frame_id !== null) {
            cancelAnimationFrame(this.animation_frame_id)
            this.animation_frame_id = null
        }

        if (this.media_stream) {
            for (const track of this.media_stream.getTracks()) {
                track.stop()
            }
            this.media_stream = null
        }

        if (this.channel_splitter) {
            this.channel_splitter.disconnect()
            this.channel_splitter = null
        }

        if (this.channel_merger) {
            this.channel_merger.disconnect()
            this.channel_merger = null
        }

        if (this.monitor_gain_node) {
            this.monitor_gain_node.disconnect()
            this.monitor_gain_node = null
        }

        if (this.audio_context) {
            void this.audio_context.close()
            this.audio_context = null
        }

        this.analyser = null
        this.is_listening = false
        this.current_pitch = null
        this.current_note = null
        this.current_cents = 0
        this.clarity = 0
        this.pitch_history = []
        this.consecutive_detected_frames = 0
        this.pending_result = null
        this.notify_change()
    }

    private run_loop = (): void => {
        if (!this.is_listening || !this.analyser || !this.audio_context) {
            return
        }

        // @ts-expect-error TypedArray compatibility
        this.analyser.getFloatTimeDomainData(this.buffer)
        const result: PitchDetectionResult | null = extract_pitch_autocorrelation(
            this.buffer,
            this.audio_context.sampleRate
        )

        const now = performance.now()

        if (result) {
            this.consecutive_detected_frames++
            this.pending_result = result
            this.silence_start_time = 0

            // Require at least 2 consecutive frames to confirm pitch (eliminates transient noise clicks)
            if (this.consecutive_detected_frames >= 2) {
                this.current_pitch = result.pitch_hz
                this.current_note = result.full_name
                this.current_cents = result.cents
                this.clarity = result.clarity

                // Update canvas history (max 150 points)
                this.pitch_history.push({
                    time: now,
                    pitch_hz: result.pitch_hz,
                    note_name: result.full_name
                })
                if (this.pitch_history.length > 150) {
                    this.pitch_history.shift()
                }
            }
        } else {
            this.consecutive_detected_frames = 0
            if (this.silence_start_time === 0) {
                this.silence_start_time = now
            }

            // Hold note display for 180ms during vocal pauses before fading out
            if (now - this.silence_start_time > 180) {
                if (this.current_pitch !== null) {
                    this.current_pitch = null
                    this.current_note = null
                    this.notify_change()
                }
            }
        }

        // Throttle React state notification to ~12 FPS (every 80ms) to avoid churning React re-renders
        if (now - this.last_notify_time > 80) {
            this.last_notify_time = now
            this.notify_change()
        }

        this.animation_frame_id = requestAnimationFrame(this.run_loop)
    }
}

export const pitch_controller = new PitchController()
