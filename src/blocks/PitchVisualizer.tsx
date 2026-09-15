import { useEffect, useRef } from "react"
import { usePitchState, pitch_controller } from "@/core/controllers"
import { MicIcon, MicOffIcon, HeadphonesIcon, VolumeIcon, VolumeMuteIcon } from "./icons"

export function PitchVisualizer() {
    const {
        is_listening,
        is_monitor_enabled,
        monitor_volume,
        selected_device_id,
        audio_input_devices,
        channel_mode,
        current_pitch,
        current_note,
        current_cents,
        error_message
    } = usePitchState()

    const canvas_ref = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        void pitch_controller.update_devices()
    }, [])

    // Direct 60 FPS Canvas rendering loop independent of React renders
    useEffect(() => {
        const canvas = canvas_ref.current
        if (!canvas) {
            return
        }

        const ctx = canvas.getContext("2d")
        if (!ctx) {
            return
        }

        let anim_id: number

        const render = () => {
            const width = canvas.width
            const height = canvas.height

            // Clear canvas background
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)"
            ctx.fillRect(0, 0, width, height)

            // Draw fixed horizontal pitch grid lines
            ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"
            ctx.lineWidth = 1
            for (let y = 16; y < height; y += 24) {
                ctx.beginPath()
                ctx.moveTo(0, y)
                ctx.lineTo(width, y)
                ctx.stroke()
            }

            const history = pitch_controller.get_pitch_history()
            if (history.length >= 2) {
                // Map pitch Hz (65Hz - 880Hz) to Y axis
                const min_midi = 36 // C2
                const max_midi = 81 // A5

                ctx.strokeStyle = "rgba(255, 255, 255, 0.85)"
                ctx.lineWidth = 2.5
                ctx.lineJoin = "round"
                ctx.lineCap = "round"
                ctx.beginPath()

                const step_x = width / 120
                const start_idx = Math.max(0, history.length - 120)

                let is_first = true
                for (let i = start_idx; i < history.length; i++) {
                    const pt = history[i]
                    const x = (i - start_idx) * step_x

                    const midi = 69 + 12 * Math.log2(pt.pitch_hz / 440)
                    const normalized_y = 1 - Math.max(0, Math.min(1, (midi - min_midi) / (max_midi - min_midi)))
                    const y = 14 + normalized_y * (height - 28)

                    if (is_first) {
                        ctx.moveTo(x, y)
                        is_first = false
                    } else {
                        ctx.lineTo(x, y)
                    }
                }
                ctx.stroke()

                // Draw leading cursor dot
                const last_pt = history[history.length - 1]
                if (last_pt) {
                    const x = (history.length - 1 - start_idx) * step_x
                    const midi = 69 + 12 * Math.log2(last_pt.pitch_hz / 440)
                    const normalized_y = 1 - Math.max(0, Math.min(1, (midi - min_midi) / (max_midi - min_midi)))
                    const y = 14 + normalized_y * (height - 28)

                    ctx.fillStyle = "#ffffff"
                    ctx.beginPath()
                    ctx.arc(x, y, 3.5, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            anim_id = requestAnimationFrame(render)
        }

        anim_id = requestAnimationFrame(render)
        return () => cancelAnimationFrame(anim_id)
    }, [])

    const toggle_mic = () => {
        if (is_listening) {
            pitch_controller.stop()
        } else {
            void pitch_controller.start()
        }
    }

    return (
        <div className="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-white/10 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 min-h-12">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={toggle_mic}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            is_listening
                                ? "bg-white text-black hover:bg-white/90"
                                : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                    >
                        {is_listening ? (
                            <>
                                <MicIcon className="w-4 h-4 animate-pulse" />
                                <span>Listening</span>
                            </>
                        ) : (
                            <>
                                <MicOffIcon className="w-4 h-4" />
                                <span>Enable Mic</span>
                            </>
                        )}
                    </button>

                    {audio_input_devices.length > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] text-white/40 uppercase tracking-wider hidden sm:inline">Mic</span>
                            <select
                                value={selected_device_id || ""}
                                onChange={(e) => void pitch_controller.select_device(e.target.value)}
                                className="bg-transparent text-xs text-white/80 focus:outline-none cursor-pointer max-w-32.5 sm:max-w-50 truncate"
                                title="Select Audio Input Device"
                            >
                                {audio_input_devices.map((d) => (
                                    <option key={d.device_id} value={d.device_id} className="bg-zinc-900 text-white">
                                        {d.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {error_message && (
                        <span className="text-xs text-white/50">{error_message}</span>
                    )}
                </div>

                {/* Fixed geometry display container to prevent layout shifts */}
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-white/40 tracking-wider">PITCH / NOTE</span>
                        <div className="flex items-baseline gap-2">
                            {/* Fixed width note display */}
                            <span className="w-14 text-center text-2xl font-bold font-mono text-white tracking-wide">
                                {current_note || "--"}
                            </span>
                            {/* Fixed width frequency display (toggled via opacity, never unmounted) */}
                            <span
                                className={`w-16 text-right text-xs font-mono tabular-nums transition-opacity duration-150 ${
                                    current_pitch ? "text-white/60 opacity-100" : "opacity-0"
                                }`}
                            >
                                {current_pitch ? `${current_pitch.toFixed(1)} Hz` : "0.0 Hz"}
                            </span>
                        </div>
                    </div>

                    {/* Fixed width cents deviation pill (toggled via opacity, never unmounted) */}
                    <div
                        className={`w-14 text-center text-xs font-mono py-0.5 rounded bg-white/10 text-white/70 tabular-nums transition-opacity duration-150 ${
                            current_pitch ? "opacity-100" : "opacity-0"
                        }`}
                    >
                        {current_pitch ? (current_cents > 0 ? `+${current_cents}c` : `${current_cents}c`) : "--"}
                    </div>
                </div>
            </div>

            {/* Audio Monitor & Ear Return Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-black/40 border border-white/5 text-xs">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void pitch_controller.toggle_monitor()}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                            is_monitor_enabled
                                ? "bg-white text-black hover:bg-white/90"
                                : "bg-white/10 text-white/60 hover:text-white hover:bg-white/20"
                        }`}
                    >
                        <HeadphonesIcon className="w-3.5 h-3.5" />
                        <span>{is_monitor_enabled ? "Ear Return On" : "Ear Return Off"}</span>
                    </button>
                    <span className="text-[11px] text-white/40 hidden sm:inline">
                        (Use headphones to prevent feedback)
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Channel Mode Selector for Dual-Mono / Stereo / Left / Right */}
                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-1.5 py-0.5">
                        <span className="text-[10px] text-white/40 uppercase hidden sm:inline">Channel</span>
                        <select
                            value={channel_mode}
                            onChange={(e) => pitch_controller.set_channel_mode(e.target.value as "mono" | "stereo" | "left" | "right")}
                            className="bg-transparent text-[11px] text-white/80 focus:outline-none cursor-pointer"
                            title="Channel Mode: Choose Mono to hear sound in both ears from single-input soundcards"
                        >
                            <option value="mono" className="bg-zinc-900 text-white">Mono (Both Ears)</option>
                            <option value="left" className="bg-zinc-900 text-white">Left (Mic 1)</option>
                            <option value="right" className="bg-zinc-900 text-white">Right (Mic 2)</option>
                            <option value="stereo" className="bg-zinc-900 text-white">Stereo</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5 text-white/60">
                        {monitor_volume === 0 || !is_monitor_enabled ? (
                            <VolumeMuteIcon className="w-3.5 h-3.5" />
                        ) : (
                            <VolumeIcon className="w-3.5 h-3.5" />
                        )}
                        <span className="text-[11px] font-mono w-7 text-right">
                            {Math.round(monitor_volume * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(monitor_volume * 100)}
                        onChange={(e) => pitch_controller.set_monitor_volume(Number(e.target.value) / 100)}
                        className="w-16 sm:w-24 accent-white h-1 bg-white/20 rounded cursor-pointer"
                        title="Ear return volume"
                    />
                </div>
            </div>

            {/* Pitch Contour Canvas */}
            <div className="relative w-full h-32 rounded-lg overflow-hidden border border-white/5 bg-black/50">
                <canvas
                    ref={canvas_ref}
                    width={600}
                    height={128}
                    className="w-full h-full block"
                />
                {!is_listening && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/40">
                        Enable microphone to capture real-time pitch
                    </div>
                )}
            </div>
        </div>
    )
}
