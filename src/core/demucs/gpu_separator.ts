import * as ort from "onnxruntime-web"
import { DEMUCS_CONSTANTS, type DemucsTrackName } from "./constants"
import { GpuStemsDsp, type TrackBinds } from "./gpu_dsp"
import { get_segment_starts } from "./segments"

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

export type SeparatedStems = Record<DemucsTrackName, StemChannels> & {
    instrumental?: StemChannels
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

    constructor(options: GpuSeparatorOptions = {}) {
        this.on_log = options.on_log ?? (() => {})
        this.on_progress = options.on_progress
        this.extra_session_options = options.session_options ?? {}
        this.gentle = options.gentle ?? false
        this.should_cancel = options.should_cancel ?? (() => false)
    }

    public async init_chain(chain: ModelChain): Promise<void> {
        this.chain_outputs = chain.outputs
        const finals = new Set([chain.outputs.freq, chain.outputs.time])
        const pieces: LoadedChainPiece[] = []

        for (let i = 0; i < chain.pieces.length; i++) {
            const p = chain.pieces[i]
            const is_final = p.outputs.some((o) => finals.has(o))
            if (is_final && !p.outputs.every((o) => finals.has(o))) {
                throw new Error(`chain piece ${i} mixes final and boundary outputs`)
            }

            const opts: ort.InferenceSession.SessionOptions = {
                executionProviders: ["webgpu"],
                graphOptimizationLevel: "all",
                preferredOutputLocation: "gpu-buffer",
                ...(i === 0 ? this.extra_session_options : {})
            }

            const session = await ort.InferenceSession.create(p.buf, opts)
            pieces.push({
                session,
                inputs: p.inputs,
                outputs: p.outputs,
                fetches: is_final ? {} : null
            })
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
        const boundary: ort.Tensor[] = []

        try {
            for (const piece of this.chain) {
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
                if (this.gentle) {
                    await this.device.queue.onSubmittedWorkDone()
                    await new Promise((r) => setTimeout(r, 3))
                }
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

    private async readback(buf: GPUBuffer, floats: number): Promise<Float32Array> {
        const staging = this.device.createBuffer({
            size: floats * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        })
        const encoder = this.device.createCommandEncoder()
        encoder.copyBufferToBuffer(buf, 0, staging, 0, floats * 4)
        this.device.queue.submit([encoder.finish()])
        await staging.mapAsync(GPUMapMode.READ)
        const out = new Float32Array(staging.getMappedRange().slice(0))
        staging.unmap()
        staging.destroy()
        return out
    }

    public async separate(left: Float32Array, right: Float32Array): Promise<SeparatedStems> {
        if (!this.session || !this.chain) {
            throw new Error("GpuSeparator not initialized")
        }

        const total_samples = left.length
        const acc_bytes = total_samples * 4
        const limit = this.device.limits.maxStorageBufferBindingSize
        if (acc_bytes > limit) {
            throw new Error(`Audio too long for WebGPU path (${acc_bytes} > maxStorageBufferBindingSize ${limit})`)
        }

        const starts = get_segment_starts(total_samples)
        const total_segments = starts.length
        const acc_usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC

        const accs = TRACKS.map((_, t) =>
            [0, 1].map((c) =>
                this.device.createBuffer({ size: acc_bytes, usage: acc_usage, label: `acc-${t}-${c}` })
            )
        )
        const weights = this.device.createBuffer({ size: acc_bytes, usage: acc_usage, label: "weights" })
        const binds = this.dsp.make_track_binds(this.freq_buf, this.time_buf, accs, weights)

        const is_short = total_samples < TRAINING_SAMPLES
        const pad_l = is_short ? new Float32Array(TRAINING_SAMPLES) : null
        const pad_r = is_short ? new Float32Array(TRAINING_SAMPLES) : null

        try {
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
                this.dsp.encode_post(post, binds, {
                    start,
                    copy_len: segment_length,
                    segment_length,
                    total_samples
                })
                this.device.queue.submit([post.finish()])

                this.on_progress?.({
                    progress: (n + 1) / total_segments,
                    current_segment: n + 1,
                    total_segments
                })

                if (this.gentle && n + 1 < total_segments) {
                    await new Promise((r) => setTimeout(r, Math.min(1500, Date.now() - seg_t0)))
                }
            }

            const norm = this.device.createCommandEncoder({ label: "normalize" })
            for (const pair of accs) {
                for (const acc of pair) {
                    this.dsp.encode_normalize(norm, acc, weights, total_samples)
                }
            }
            this.device.queue.submit([norm.finish()])

            const result = {} as SeparatedStems
            for (let t = 0; t < TRACKS.length; t++) {
                const name = TRACKS[t]
                result[name] = {
                    left: await this.readback(accs[t][0], total_samples),
                    right: await this.readback(accs[t][1], total_samples)
                }
            }

            // Synthesize instrumental: drums + bass + other (or mix - vocals)
            const inst_l = new Float32Array(total_samples)
            const inst_r = new Float32Array(total_samples)
            for (let i = 0; i < total_samples; i++) {
                inst_l[i] = result.drums.left[i] + result.bass.left[i] + result.other.left[i]
                inst_r[i] = result.drums.right[i] + result.bass.right[i] + result.other.right[i]
            }
            result.instrumental = { left: inst_l, right: inst_r }

            return result
        } finally {
            for (const pair of accs) {
                for (const acc of pair) acc.destroy()
            }
            weights.destroy()
        }
    }

    public async release(): Promise<void> {
        if (this.chain) {
            for (const p of this.chain) {
                await p.session.release?.().catch(() => {})
            }
            this.chain = null
        }
        this.session = null
    }
}
