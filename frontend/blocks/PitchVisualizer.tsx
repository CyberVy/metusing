import { Mic, MicOff, Headphones, Volume, VolumeX, ChevronDown, Check } from "lucide-react"
import { useCallback } from "react"
import { Badge, Button, Select, Text } from "@/components"
import { usePitchState, pitch_controller } from "@/core/controllers"
import type { ChannelMode } from "@/core/controllers"
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

    // Direct 60 FPS Canvas rendering loop independent of React renders
    const attach_canvas = useCallback((canvas: HTMLCanvasElement | null) => {
        if (!canvas) {
            return
        }

        const ctx = canvas.getContext("2d")
        if (!ctx) {
            return
        }

        let canvas_line_color = getComputedStyle(canvas).color
        const dark_mode_media_query = window.matchMedia("(prefers-color-scheme: dark)")
        const handle_color_scheme_change = () => {
            canvas_line_color = getComputedStyle(canvas).color
        }
        dark_mode_media_query.addEventListener("change", handle_color_scheme_change)

        let anim_id: number

        const render = () => {
            const width = canvas.width
            const height = canvas.height

            // Clear canvas; the parent element provides the theme-aware background.
            ctx.clearRect(0, 0, width, height)

            // Draw fixed horizontal pitch grid lines
            ctx.strokeStyle = canvas_line_color
            ctx.globalAlpha = 0.08
            ctx.lineWidth = 1
            for (let y = 16; y < height; y += 24) {
                ctx.beginPath()
                ctx.moveTo(0, y)
                ctx.lineTo(width, y)
                ctx.stroke()
            }
            ctx.globalAlpha = 0.85

            const history = pitch_controller.get_pitch_history()
            if (history.length >= 2) {
                // Map pitch Hz (65Hz - 880Hz) to Y axis
                const min_midi = 36 // C2
                const max_midi = 81 // A5

                ctx.strokeStyle = canvas_line_color
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

                    ctx.fillStyle = canvas_line_color
                    ctx.globalAlpha = 1
                    ctx.beginPath()
                    ctx.arc(x, y, 3.5, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            ctx.globalAlpha = 1

            anim_id = requestAnimationFrame(render)
        }

        anim_id = requestAnimationFrame(render)
        return () => {
            cancelAnimationFrame(anim_id)
            dark_mode_media_query.removeEventListener("change", handle_color_scheme_change)
        }
    }, [])

    const toggle_mic = () => {
        if (is_listening) {
            pitch_controller.stop()
        } else {
            void pitch_controller.start()
        }
    }

    return (
        <div className="flex flex-col gap-3 p-4 bg-zinc-100/80 dark:bg-zinc-900/60 border border-black/10 dark:border-white/10 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 min-h-12">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant={is_listening ? "primary" : "secondary"}
                        size="auto"
                        shape="rounded"
                        onClick={toggle_mic}
                        className={`px-3 py-1.5 text-sm font-medium ${is_listening ? "border border-transparent" : ""}`}
                    >
                        <span className="inline-flex items-center gap-2">
                            {is_listening ? (
                                <>
                                    <Mic className="w-4 h-4 animate-pulse" />
                                    <Text variant="body" weight="medium" tone="inherit">
                                        Listening
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <MicOff className="w-4 h-4" />
                                    <Text variant="body" weight="medium" tone="inherit">
                                        Enable Mic
                                    </Text>
                                </>
                            )}
                        </span>
                    </Button>

                    {audio_input_devices.length > 0 && (
                        <div className="flex items-center gap-1.5">
                            <Text variant="overline" weight="normal" tone="tertiary" className="hidden sm:inline">
                                Mic
                            </Text>
                            <Select
                                aria_label="Select Audio Input Device"
                                value={selected_device_id ?? undefined}
                                on_change={(device_id) => void pitch_controller.select_device(device_id)}
                                placeholder="Select Microphone"
                                align="left"
                                indicator={<ChevronDown width={14} height={14} className="opacity-55" />}
                                selected_indicator={<Check width={14} height={14} />}
                                trigger_class_name="max-w-40 sm:max-w-56"
                                menu_class_name="max-w-64 sm:max-w-80"
                                options={audio_input_devices.map((d) => ({
                                    value: d.device_id,
                                    label: d.label
                                }))}
                            />
                        </div>
                    )}

                    {error_message && (
                        <Text variant="caption" tone="secondary">
                            {error_message}
                        </Text>
                    )}
                </div>

                {/* Fixed geometry display container to prevent layout shifts */}
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end">
                        <Text variant="overline" weight="normal" tone="tertiary" className="normal-case">
                            PITCH / NOTE
                        </Text>
                        <div className="flex items-baseline gap-2">
                            {/* Fixed width note display */}
                            <Text variant="title" mono align="center" className="w-14 text-2xl tracking-wide">
                                {current_note || "--"}
                            </Text>
                            {/* Fixed width frequency display (toggled via opacity, never unmounted) */}
                            <Text
                                variant="caption"
                                tone="inherit"
                                mono
                                align="right"
                                className={`w-16 transition-opacity duration-150 ${
                                    current_pitch ? "text-black/60 dark:text-white/60 opacity-100" : "opacity-0"
                                }`}
                            >
                                {current_pitch ? `${current_pitch.toFixed(1)} Hz` : "0.0 Hz"}
                            </Text>
                        </div>
                    </div>

                    {/* Fixed width cents deviation pill (toggled via opacity, never unmounted) */}
                    <Badge
                        tone="subtle"
                        mono
                        className={`w-14 justify-center text-xs text-black/70 dark:text-white/70 tabular-nums transition-opacity duration-150 ${
                            current_pitch ? "opacity-100" : "opacity-0"
                        }`}
                    >
                        {current_pitch ? (current_cents > 0 ? `+${current_cents}c` : `${current_cents}c`) : "--"}
                    </Badge>
                </div>
            </div>

            {/* Audio Monitor & Ear Return Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-black/5 dark:bg-black/40 border border-black/5 dark:border-white/5 text-xs">
                <div className="flex items-center gap-2">
                    <Button
                        variant={is_monitor_enabled ? "primary" : "secondary"}
                        size="xs"
                        shape="rounded"
                        onClick={() => void pitch_controller.toggle_monitor()}
                        className={is_monitor_enabled ? "border border-transparent" : undefined}
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Headphones className="w-3.5 h-3.5" />
                            <Text variant="caption" weight="medium" tone="inherit">
                                {is_monitor_enabled ? "Ear Return On" : "Ear Return Off"}
                            </Text>
                        </span>
                    </Button>
                    <Text variant="footnote" tone="tertiary" className="hidden sm:inline">
                        (Use headphones to prevent feedback)
                    </Text>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Channel Mode Selector for Dual-Mono / Stereo / Left / Right */}
                    <div className="flex items-center gap-1.5">
                        <Text
                            variant="overline"
                            weight="normal"
                            tone="tertiary"
                            className="tracking-normal hidden sm:inline"
                        >
                            Channel
                        </Text>
                        <Select<ChannelMode>
                            aria_label="Channel Mode"
                            value={channel_mode}
                            on_change={(mode) => pitch_controller.set_channel_mode(mode)}
                            align="left"
                            indicator={<ChevronDown width={14} height={14} className="opacity-55" />}
                            selected_indicator={<Check width={14} height={14} />}
                            trigger_class_name="py-1 text-[11px]"
                            options={[
                                { value: "mono", label: "Mono (Both Ears)" },
                                { value: "left", label: "Left (Mic 1)" },
                                { value: "right", label: "Right (Mic 2)" },
                                { value: "stereo", label: "Stereo" }
                            ]}
                        />
                    </div>

                    <div className="flex items-center gap-1.5 text-black/60 dark:text-white/60">
                        {monitor_volume === 0 || !is_monitor_enabled ? (
                            <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                            <Volume className="w-3.5 h-3.5" />
                        )}
                        <Text variant="footnote" tone="inherit" mono align="right" className="w-7">
                            {Math.round(monitor_volume * 100)}%
                        </Text>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(monitor_volume * 100)}
                        onChange={(e) => pitch_controller.set_monitor_volume(Number(e.target.value) / 100)}
                        className="w-16 sm:w-24 accent-black dark:accent-white h-1 bg-black/10 dark:bg-white/20 rounded cursor-pointer"
                        title="Ear return volume"
                    />
                </div>
            </div>

            {/* Pitch Contour Canvas */}
            <div className="relative w-full h-32 rounded-lg overflow-hidden border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-950">
                <canvas
                    ref={attach_canvas}
                    width={600}
                    height={128}
                    className="w-full h-full block text-black dark:text-white"
                />
                {!is_listening && (
                    <Text
                        as="div"
                        variant="caption"
                        tone="tertiary"
                        className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/40"
                    >
                        Enable microphone to capture real-time pitch
                    </Text>
                )}
            </div>
        </div>
    )
}
