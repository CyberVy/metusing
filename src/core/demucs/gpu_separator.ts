import * as ort from "onnxruntime-web"
import { DEMUCS_CONSTANTS } from "./constants"
import { GpuStemsDsp } from "./gpu_dsp"
import { get_segment_starts } from "./segments"
import type { SplitManifest } from "./model_loader"

const { TRAINING_SAMPLES, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES, TRACKS } = DEMUCS_CONSTANTS
const PLANE = MODEL_SPEC_BINS * MODEL_SPEC_FRAMES

export interface ChainPieceConfig {
    buf: ArrayBuffer
    inputs: string[]
    outputs: string[]
}

export interface ModelChain {
    pieces: ChainPieceConfig[]
    outputs: {
        freq: string
        time: string
    }
}

interface LoadedChainPiece {
    session: ort.InferenceSession
    inputs: string[]
    outputs: string[]
    fetches: Record<string, ort.Tensor> | null
}

export interface GpuSeparatorOptions {
    session_options?: Record<string, unknown>
    gentle?: boolean
    on_log?: (phase: string, message: string) => void
    on_progress?: (info: { progress: number; current_segment: number; total_segments: number }) => void
    should_cancel?: () => boolean
}

export interface StemChannels {
    left: Float32Array
    right: Float32Array
}

export interface SeparatedStems {
    vocals: StemChannels
    instrumental: StemChannels
    drums?: StemChannels
    bass?: StemChannels
    other?: StemChannels
}

export interface SeparateOptions {
    mode?: "karaoke" | "all"
}

export class GpuSeparator {
    private on_log: (phase: string, message: string) => void
    private on_progress?: (info: { progress: number; current_segment: number; total_segments: number }) => void
    private extra_session_options: Record<string, unknown>
    private gentle: boolean
    private should_cancel: () => boolean

    public session: ort.InferenceSession | null = null
    public device!: GPUDevice
    public dsp!: GpuStemsDsp
    public freq_buf!: GPUBuffer
    public time_buf!: GPUBuffer
    private feeds: Record<string, ort.Tensor> = {}
    private chain: LoadedChainPiece[] | null = null
    private chain_outputs: { freq: string; time: string } | null = null
    private tensor_use_counts: Record<string, number> = {}

    constructor(options: GpuSeparatorOptions = {}) {
        this.on_log = options.on_log ?? (() => {})
        this.on_progress = options.on_progress
        this.extra_session_options = options.session_options ?? {}
        this.gentle = options.gentle ?? false
        this.should_cancel = options.should_cancel ?? (() => false)
    }

    public async init_chain_streaming(
        manifest: SplitManifest,
        load_piece_buf: (file: string) => Promise<ArrayBuffer>,
        on_progress?: (current: number, total: number, file: string) => void
    ): Promise<void> {
        this.chain_outputs = manifest.outputs

        // Precompute consumer reference counts for automatic boundary tensor garbage collection
        const counts: Record<string, number> = {}
        for (const p of manifest.pieces) {
            for (const input of p.inputs) {
                counts[input] = (counts[input] || 0) + 1
            }
        }
        this.tensor_use_counts = counts
        const finals = new Set([manifest.outputs.freq, manifest.outputs.time])
        const pieces: LoadedChainPiece[] = []
        const total = manifest.pieces.length

        for (let i = 0; i < total; i++) {
            const p = manifest.pieces[i]
            on_progress?.(i + 1, total, p.file)

            const is_final = p.outputs.some((o) => finals.has(o))
            if (is_final && !p.outputs.every((o) => finals.has(o))) {
                throw new Error(`chain piece ${i} mixes final and boundary outputs`)
            }

            // Fetch only this piece's buffer on demand
            let buf: ArrayBuffer | null = await load_piece_buf(p.file)

            const opts: ort.InferenceSession.SessionOptions = {
                executionProviders: ["webgpu"],
                graphOptimizationLevel: "all",
                preferredOutputLocation: "gpu-buffer",
                enableCpuMemArena: false,
                enableMemPattern: false,
                executionMode: "sequential",
                ...(i === 0 ? this.extra_session_options : {})
            }

            const session = await ort.InferenceSession.create(buf, opts)
            // Immediately drop buffer reference from memory to keep JS heap clean!
            buf = null

            pieces.push({
                session,
                inputs: p.inputs,
                outputs: p.outputs,
                fetches: is_final ? {} : null
            })

            // Interleave session initialization to let iOS WebKit Metal compiler breathe
            await new Promise((r) => setTimeout(r, 40))
        }

        this.chain = pieces
        this.session = pieces[0].session

        // ORT exposes its WebGPU device after session init
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env_webgpu = (ort.env as any).webgpu
        const device = env_webgpu?.device as GPUDevice | undefined
        if (!device) {
            throw new Error("ORT exposed no WebGPU device after session init")
        }

        this.device = device
        this.dsp = new GpuStemsDsp(device)

        const out_usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        this.freq_buf = device.createBuffer({
            size: 16 * PLANE * 4,
            usage: out_usage,
            label: "model-freq-out"
        })
        this.time_buf = device.createBuffer({
            size: 8 * TRAINING_SAMPLES * 4,
            usage: out_usage,
            label: "model-time-out"
        })

        this.dsp.init_track_binds(this.freq_buf, this.time_buf)
        this.build_chain_io()
        this.on_log("gpu", `WebGPU pipeline ready (chained: ${pieces.length} pieces)`)
    }

    private build_chain_io(): void {
        if (!this.chain || !this.chain_outputs) return

        const wave_tensor = ort.Tensor.fromGpuBuffer(this.dsp.waveform_buffer, {
            dataType: "float32",
            dims: [1, 2, TRAINING_SAMPLES]
        })
        const spec_tensor = ort.Tensor.fromGpuBuffer(this.dsp.mag_spec_buffer, {
            dataType: "float32",
            dims: [1, 4, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES]
        })
        const freq_tensor = ort.Tensor.fromGpuBuffer(this.freq_buf, {
            dataType: "float32",
            dims: [1, 4, 4, MODEL_SPEC_BINS, MODEL_SPEC_FRAMES]
        })
        const time_tensor = ort.Tensor.fromGpuBuffer(this.time_buf, {
            dataType: "float32",
            dims: [1, 4, 2, TRAINING_SAMPLES]
        })

        this.feeds = { mix: wave_tensor, mag: spec_tensor }

        const { freq, time } = this.chain_outputs
        for (const piece of this.chain) {
            if (!piece.fetches) continue
            for (const o of piece.outputs) {
                piece.fetches[o] = o === freq ? freq_tensor : o === time ? time_tensor : piece.fetches[o]
            }
        }
    }

    private async run_chain(): Promise<void> {
        if (!this.chain) throw new Error("Chain not initialized")

        const vals: Record<string, ort.Tensor> = { ...this.feeds }
        const ref_counts: Record<string, number> = { ...this.tensor_use_counts }
        const boundary: ort.Tensor[] = []

        try {
            for (let p_idx = 0; p_idx < this.chain.length; p_idx++) {
                const piece = this.chain[p_idx]
                const feeds: Record<string, ort.Tensor> = {}
                for (const nm of piece.inputs) {
                    const v = vals[nm]
                    if (!v) throw new Error(`chain: missing boundary tensor ${nm}`)
                    feeds[nm] = v
                }

                if (piece.fetches) {
                    await piece.session.run(feeds, piece.fetches)
                } else {
                    const res = await piece.session.run(feeds)
                    for (const nm of piece.outputs) {
                        vals[nm] = res[nm]
                        boundary.push(res[nm])
                    }
                }

                // Immediately release tensors whose last consumer has finished
                for (const nm of piece.inputs) {
                    if (nm === "mix" || nm === "mag") continue // persistent feeds
                    ref_counts[nm] = (ref_counts[nm] ?? 1) - 1
                    if (ref_counts[nm] <= 0) {
                        const dead = vals[nm]
                        if (dead) {
                            delete vals[nm]
                            try {
                                dead.dispose?.()
                            } catch {
                                // Ignore cleanup failure
                            }
                        }
                    }
                }

                // Yield to GPU queue and browser compositor so OS/Safari never starves
                await this.device.queue.onSubmittedWorkDone()
                await new Promise((r) => setTimeout(r, this.gentle ? 14 : 3))
            }
        } finally {
            for (const b of boundary) {
                try {
                    b.dispose?.()
                } catch {
                    // Freed with session
                }
            }
        }
    }

    public async separate(
        left: Float32Array,
        right: Float32Array,
        options: SeparateOptions = {}
    ): Promise<SeparatedStems> {
        if (!this.session || !this.chain) {
            throw new Error("GpuSeparator not initialized")
        }

        const mode = options.mode ?? "karaoke"
        const total_samples = left.length
        const starts = get_segment_starts(total_samples)
        const total_segments = starts.length

        const half_stride = Math.floor(TRAINING_SAMPLES * 0.75) * 0.5
        const w_standard = new Float32Array(TRAINING_SAMPLES)
        for (let i = 0; i < TRAINING_SAMPLES; i++) {
            const fade_in = Math.min(i / half_stride, 1.0)
            const fade_out = Math.min((TRAINING_SAMPLES - i) / half_stride, 1.0)
            w_standard[i] = Math.min(fade_in, fade_out)
        }

        let cpu_weights: Float32Array | null = new Float32Array(total_samples)

        let vocals_l: Float32Array
        let vocals_r: Float32Array
        let inst_l: Float32Array
        let inst_r: Float32Array
        let cpu_accs: Float32Array[][] | null = null

        if (mode === "karaoke") {
            vocals_l = new Float32Array(total_samples)
            vocals_r = new Float32Array(total_samples)
            inst_l = new Float32Array(total_samples)
            inst_r = new Float32Array(total_samples)
        } else {
            cpu_accs = TRACKS.map(() => [
                new Float32Array(total_samples),
                new Float32Array(total_samples)
            ])
            vocals_l = cpu_accs[3][0]
            vocals_r = cpu_accs[3][1]
            inst_l = new Float32Array(total_samples)
            inst_r = new Float32Array(total_samples)
        }

        const is_short = total_samples < TRAINING_SAMPLES
        const pad_l = is_short ? new Float32Array(TRAINING_SAMPLES) : null
        const pad_r = is_short ? new Float32Array(TRAINING_SAMPLES) : null

        for (let n = 0; n < total_segments; n++) {
            if (this.should_cancel()) throw new Error("Separation cancelled")

            const seg_t0 = Date.now()
            const start = starts[n]
            const segment_length = Math.min(start + TRAINING_SAMPLES, total_samples) - start

            if (is_short && pad_l && pad_r) {
                pad_l.fill(0)
                pad_r.fill(0)
                pad_l.set(left.subarray(start, start + segment_length))
                pad_r.set(right.subarray(start, start + segment_length))
                this.dsp.write_segment(pad_l, pad_r)
            } else {
                this.dsp.write_segment(
                    left.subarray(start, start + TRAINING_SAMPLES),
                    right.subarray(start, start + TRAINING_SAMPLES)
                )
            }

            const pre = this.device.createCommandEncoder({ label: `stft-${n}` })
            this.dsp.encode_stft(pre, 0)
            this.dsp.encode_stft(pre, 1)
            this.device.queue.submit([pre.finish()])

            await this.run_chain()

            const post = this.device.createCommandEncoder({ label: `post-${n}` })
            this.dsp.encode_post(post, {
                copy_len: segment_length,
                segment_length
            })
            this.device.queue.submit([post.finish()])

            await this.dsp.readback_chunk((mapped) => {
                if (mode === "karaoke") {
                    const voc_l_off = 6 * TRAINING_SAMPLES
                    const voc_r_off = 7 * TRAINING_SAMPLES
                    const d_l_off = 0 * TRAINING_SAMPLES
                    const d_r_off = 1 * TRAINING_SAMPLES
                    const b_l_off = 2 * TRAINING_SAMPLES
                    const b_r_off = 3 * TRAINING_SAMPLES
                    const o_l_off = 4 * TRAINING_SAMPLES
                    const o_r_off = 5 * TRAINING_SAMPLES

                    for (let i = 0; i < segment_length; i++) {
                        const idx = start + i
                        vocals_l[idx] += mapped[voc_l_off + i]
                        vocals_r[idx] += mapped[voc_r_off + i]
                        inst_l[idx] += mapped[d_l_off + i] + mapped[b_l_off + i] + mapped[o_l_off + i]
                        inst_r[idx] += mapped[d_r_off + i] + mapped[b_r_off + i] + mapped[o_r_off + i]
                    }
                } else if (cpu_accs) {
                    for (let plane = 0; plane < 8; plane++) {
                        const t = plane >> 1
                        const c = plane & 1
                        const acc = cpu_accs[t][c]
                        const off = plane * TRAINING_SAMPLES
                        for (let i = 0; i < segment_length; i++) {
                            acc[start + i] += mapped[off + i]
                        }
                    }
                }

                if (segment_length === TRAINING_SAMPLES) {
                    for (let i = 0; i < segment_length; i++) {
                        cpu_weights![start + i] += w_standard[i]
                    }
                } else {
                    for (let i = 0; i < segment_length; i++) {
                        const fade_in = Math.min(i / half_stride, 1.0)
                        const fade_out = Math.min((segment_length - i) / half_stride, 1.0)
                        cpu_weights![start + i] += Math.min(fade_in, fade_out)
                    }
                }
            })

            this.on_progress?.({
                progress: (n + 1) / total_segments,
                current_segment: n + 1,
                total_segments
            })

            // Ensure GPU queues are completely flushed and retired before next chunk
            await this.device.queue.onSubmittedWorkDone()

            if (n + 1 < total_segments) {
                const elapsed = Date.now() - seg_t0
                // Thermal pacing for mobile: 50% duty cycle allows chassis to radiate heat and prevent thermal throttle
                const pause_ms = this.gentle
                    ? Math.max(800, Math.min(2200, Math.floor(elapsed * 0.5)))
                    : 60
                await new Promise((r) => setTimeout(r, pause_ms))
            }
        }

        if (mode === "karaoke") {
            for (let i = 0; i < total_samples; i++) {
                const w = cpu_weights![i]
                if (w > 0) {
                    vocals_l[i] /= w
                    vocals_r[i] /= w
                    inst_l[i] /= w
                    inst_r[i] /= w
                }
            }
            cpu_weights = null
            return {
                vocals: { left: vocals_l, right: vocals_r },
                instrumental: { left: inst_l, right: inst_r }
            }
        }

        if (cpu_accs) {
            for (let t = 0; t < 4; t++) {
                for (let c = 0; c < 2; c++) {
                    const acc = cpu_accs[t][c]
                    for (let i = 0; i < total_samples; i++) {
                        const w = cpu_weights![i]
                        if (w > 0) acc[i] /= w
                    }
                }
            }
            for (let i = 0; i < total_samples; i++) {
                inst_l[i] = cpu_accs[0][0][i] + cpu_accs[1][0][i] + cpu_accs[2][0][i]
                inst_r[i] = cpu_accs[0][1][i] + cpu_accs[1][1][i] + cpu_accs[2][1][i]
            }
            cpu_weights = null
            return {
                drums: { left: cpu_accs[0][0], right: cpu_accs[0][1] },
                bass: { left: cpu_accs[1][0], right: cpu_accs[1][1] },
                other: { left: cpu_accs[2][0], right: cpu_accs[2][1] },
                vocals: { left: cpu_accs[3][0], right: cpu_accs[3][1] },
                instrumental: { left: inst_l, right: inst_r }
            }
        }

        throw new Error("Unexpected state in separate")
    }

    public async release(): Promise<void> {
        this.freq_buf?.destroy()
        this.time_buf?.destroy()
        this.dsp?.destroy()
        if (this.chain) {
            for (const p of this.chain) {
                await p.session.release?.().catch(() => {})
            }
            this.chain = null
        }
        this.session = null
    }
}
