import { DEMUCS_CONSTANTS } from "./constants"

const {
    FFT_SIZE,
    HOP_SIZE,
    TRAINING_SAMPLES,
    MODEL_SPEC_BINS,
    MODEL_SPEC_FRAMES
} = DEMUCS_CONSTANTS

const STFT_PAD = Math.floor(HOP_SIZE / 2) * 3
const STFT_LE = Math.ceil(TRAINING_SAMPLES / HOP_SIZE)
const STFT_PAD_RIGHT = STFT_PAD + STFT_LE * HOP_SIZE - TRAINING_SAMPLES
const STFT_INPUT_LEN = STFT_PAD + TRAINING_SAMPLES + STFT_PAD_RIGHT
const CENTER_PAD = FFT_SIZE / 2
const CENTERED_LEN = STFT_INPUT_LEN + 2 * CENTER_PAD
const TOTAL_FRAMES = Math.floor((CENTERED_LEN - FFT_SIZE) / HOP_SIZE) + 1
const PADDED_FRAMES = MODEL_SPEC_FRAMES + 4
const PADDED_BINS = MODEL_SPEC_BINS + 1
const ISTFT_LEN = (PADDED_FRAMES - 1) * HOP_SIZE + FFT_SIZE
const ISTFT_OFFSET = CENTER_PAD + STFT_PAD
const N2 = FFT_SIZE / 2
const PLANE = MODEL_SPEC_BINS * MODEL_SPEC_FRAMES
const WG = 256
const PER_THREAD = N2 / WG

const COMMON_WGSL = `
fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}
fn conj2(a: vec2f) -> vec2f { return vec2f(a.x, -a.y); }
`

const PAD_WGSL = `
struct PadParams { padLeft: u32, srcLen: u32, outLen: u32, srcOffset: u32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> p: PadParams;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= p.outLen) { return; }
  var s: i32;
  let li = i32(i) - i32(p.padLeft);
  if (li < 0) {
    s = min(i32(p.padLeft) - i32(i), i32(p.srcLen) - 1);
  } else if (li < i32(p.srcLen)) {
    s = li;
  } else {
    s = max(0, i32(p.srcLen) - 2 - (li - i32(p.srcLen)));
  }
  dst[i] = src[p.srcOffset + u32(s)];
}
`

const STFT_WGSL = `
${COMMON_WGSL}
struct StftParams { channelBase: u32, _a: u32, _b: u32, _c: u32 }
@group(0) @binding(0) var<storage, read> padded: array<f32>;
@group(0) @binding(1) var<storage, read> hann: array<f32>;
@group(0) @binding(2) var<storage, read> twiddle: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> magSpec: array<f32>;
@group(0) @binding(4) var<uniform> p: StftParams;

var<workgroup> buf: array<vec2f, ${N2}>;

@compute @workgroup_size(${WG})
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) li: vec3u) {
  let frame = wg.x;
  let base = frame * ${HOP_SIZE}u;
  for (var t = 0u; t < ${PER_THREAD}u; t++) {
    let i = li.x + t * ${WG}u;
    let r = reverseBits(i) >> ${32 - Math.log2(N2)}u;
    let s = base + r * 2u;
    buf[i] = vec2f(padded[s] * hann[r * 2u], padded[s + 1u] * hann[r * 2u + 1u]);
  }
  workgroupBarrier();
  var size = 2u;
  while (size <= ${N2}u) {
    let half = size >> 1u;
    let step = ${N2}u / size;
    for (var t = 0u; t < ${PER_THREAD / 2}u; t++) {
      let bi = li.x + t * ${WG}u;
      let grp = bi / half;
      let j = bi % half;
      let i1 = grp * size + j;
      let i2 = i1 + half;
      let w = twiddle[j * step];
      let e = buf[i1];
      let o = cmul(buf[i2], w);
      buf[i1] = e + o;
      buf[i2] = e - o;
    }
    workgroupBarrier();
    size = size << 1u;
  }
  let outFrame = i32(frame) - 2;
  if (outFrame < 0 || outFrame >= ${MODEL_SPEC_FRAMES}) { return; }
  for (var t = 0u; t < ${PER_THREAD}u; t++) {
    let k = li.x + t * ${WG}u;
    let zk = buf[k];
    let zn = buf[(${N2}u - k) % ${N2}u];
    let s = zk + conj2(zn);
    let d = zk - conj2(zn);
    let dm = vec2f(d.y, -d.x);
    let x = (s + cmul(twiddle[${N2 / 2}u + k], dm)) * ${(0.5 / Math.sqrt(FFT_SIZE)).toExponential()};
    let o = p.channelBase * ${PLANE}u + k * ${MODEL_SPEC_FRAMES}u + u32(outFrame);
    magSpec[o] = x.x;
    magSpec[o + ${PLANE}u] = x.y;
  }
}
`

const IFFT_WGSL = `
${COMMON_WGSL}
struct IfftParams { trackChannelBase: u32, _a: u32, _b: u32, _c: u32 }
@group(0) @binding(0) var<storage, read> freq: array<f32>;
@group(0) @binding(1) var<storage, read> hann: array<f32>;
@group(0) @binding(2) var<storage, read> twiddle: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> frames: array<f32>;
@group(0) @binding(4) var<uniform> p: IfftParams;

var<workgroup> buf: array<vec2f, ${N2}>;

fn readBin(plane: u32, k: u32, outFrame: i32) -> f32 {
  if (outFrame < 0 || outFrame >= ${MODEL_SPEC_FRAMES} || k >= ${MODEL_SPEC_BINS}u) { return 0.0; }
  return freq[plane * ${PLANE}u + k * ${MODEL_SPEC_FRAMES}u + u32(outFrame)];
}

@compute @workgroup_size(${WG})
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) li: vec3u) {
  let frame = wg.x;
  let outFrame = i32(frame) - 2;
  let rp = p.trackChannelBase;
  let ip = p.trackChannelBase + 1u;
  for (var t = 0u; t < ${PER_THREAD}u; t++) {
    let k = li.x + t * ${WG}u;
    let xk = vec2f(readBin(rp, k, outFrame), readBin(ip, k, outFrame));
    let kn = ${N2}u - k;
    let xn = vec2f(readBin(rp, kn, outFrame), readBin(ip, kn, outFrame));
    let a = xk + conj2(xn);
    let b = xk - conj2(xn);
    let d = cmul(conj2(twiddle[${N2 / 2}u + k]), b);
    let id = vec2f(-d.y, d.x);
    buf[k] = (a + id) * 0.5;
  }
  workgroupBarrier();
  var size = ${N2}u;
  while (size >= 2u) {
    let half = size >> 1u;
    let step = ${N2}u / size;
    for (var t = 0u; t < ${PER_THREAD / 2}u; t++) {
      let bi = li.x + t * ${WG}u;
      let grp = bi / half;
      let j = bi % half;
      let i1 = grp * size + j;
      let i2 = i1 + half;
      let a = buf[i1];
      let b = buf[i2];
      buf[i1] = a + b;
      buf[i2] = cmul(a - b, conj2(twiddle[j * step]));
    }
    workgroupBarrier();
    size = size >> 1u;
  }
  for (var t = 0u; t < ${PER_THREAD}u; t++) {
    let n = li.x + t * ${WG}u;
    let r = reverseBits(n) >> ${32 - Math.log2(N2)}u;
    let z = buf[r];
    let o = frame * ${FFT_SIZE}u + n * 2u;
    frames[o] = z.x * hann[n * 2u] * (1.0 / 32.0);
    frames[o + 1u] = z.y * hann[n * 2u + 1u] * (1.0 / 32.0);
  }
}
`

const OLA_WGSL = `
@group(0) @binding(0) var<storage, read> frames: array<f32>;
@group(0) @binding(1) var<storage, read> recip: array<f32>;
@group(0) @binding(2) var<storage, read_write> timeOut: array<f32>;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= ${ISTFT_LEN}u) { return; }
  var acc = 0.0;
  let fMax = min(i / ${HOP_SIZE}u, ${PADDED_FRAMES - 1}u);
  var f = select(0u, (i - ${FFT_SIZE - 1}u + ${HOP_SIZE - 1}u) / ${HOP_SIZE}u, i >= ${FFT_SIZE - 1}u);
  for (; f <= fMax; f++) {
    acc += frames[f * ${FFT_SIZE}u + (i - f * ${HOP_SIZE}u)];
  }
  timeOut[i] = acc * recip[i];
}
`

const COMBINE_WGSL = `
struct CombineParams {
  start: u32,
  copyLen: u32,
  segmentLength: u32,
  timeBase: u32,
  addWeights: u32,
  totalSamples: u32,
  _a: u32, _b: u32,
}
@group(0) @binding(0) var<storage, read> timeData: array<f32>;
@group(0) @binding(1) var<storage, read> istftTime: array<f32>;
@group(0) @binding(2) var<storage, read_write> acc: array<f32>;
@group(0) @binding(3) var<storage, read_write> weights: array<f32>;
@group(0) @binding(4) var<uniform> p: CombineParams;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= p.copyLen) { return; }
  const halfStride: f32 = ${(Math.floor(TRAINING_SAMPLES * 0.75) * 0.5).toExponential()};
  let fadeIn = min(f32(i) / halfStride, 1.0);
  let fadeOut = min(f32(p.segmentLength - i) / halfStride, 1.0);
  let w = min(fadeIn, fadeOut);
  let v = timeData[p.timeBase + i] + istftTime[${ISTFT_OFFSET}u + i];
  acc[p.start + i] += v * w;
  if (p.addWeights == 1u) {
    weights[p.start + i] += w;
  }
}
`

const NORM_WGSL = `
struct NormParams { totalSamples: u32, _a: u32, _b: u32, _c: u32 }
@group(0) @binding(0) var<storage, read> weights: array<f32>;
@group(0) @binding(1) var<storage, read_write> acc: array<f32>;
@group(0) @binding(2) var<uniform> p: NormParams;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= p.totalSamples) { return; }
  let w = weights[i];
  if (w > 0.0) { acc[i] = acc[i] / w; }
}
`

export interface ComputePipe {
    pipeline: GPUComputePipeline
    layout: GPUBindGroupLayout
}

function make_pipe(device: GPUDevice, code: string, label: string): ComputePipe {
    const module = device.createShaderModule({ code, label })
    const pipeline = device.createComputePipeline({
        label,
        layout: "auto",
        compute: { module, entryPoint: "main" }
    })
    return { pipeline, layout: pipeline.getBindGroupLayout(0) }
}

const wg_count = (n: number) => Math.ceil(n / WG)

export interface TrackBinds {
    ifft_binds: GPUBindGroup[]
    combine_binds: GPUBindGroup[]
}

export class GpuStemsDsp {
    public readonly device: GPUDevice
    public readonly pad: ComputePipe
    public readonly stft: ComputePipe
    public readonly ifft: ComputePipe
    public readonly ola: ComputePipe
    public readonly combine: ComputePipe
    public readonly norm: ComputePipe

    public readonly hann_buf: GPUBuffer
    public readonly twiddle_buf: GPUBuffer
    public readonly recip_buf: GPUBuffer

    public readonly seg_buf: GPUBuffer
    public readonly stft_input_buf: GPUBuffer
    public readonly centered_buf: GPUBuffer
    public readonly mag_spec_buf: GPUBuffer
    public readonly frames_buf: GPUBuffer
    public readonly istft_time_buf: GPUBuffer

    private pad1_binds!: GPUBindGroup[]
    private pad2_bind!: GPUBindGroup
    private stft_binds!: GPUBindGroup[]
    private ola_bind!: GPUBindGroup
    private combine_uniforms!: GPUBuffer[]

    constructor(device: GPUDevice) {
        this.device = device
        this.pad = make_pipe(device, PAD_WGSL, "stems-pad")
        this.stft = make_pipe(device, STFT_WGSL, "stems-stft")
        this.ifft = make_pipe(device, IFFT_WGSL, "stems-ifft")
        this.ola = make_pipe(device, OLA_WGSL, "stems-ola")
        this.combine = make_pipe(device, COMBINE_WGSL, "stems-combine")
        this.norm = make_pipe(device, NORM_WGSL, "stems-normalize")

        const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC

        const hann = new Float32Array(FFT_SIZE)
        for (let i = 0; i < FFT_SIZE; i++) {
            hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FFT_SIZE))
        }
        this.hann_buf = device.createBuffer({ size: hann.byteLength, usage: storage, label: "hann" })
        device.queue.writeBuffer(this.hann_buf, 0, hann)

        const tw = new Float32Array((N2 / 2 + PADDED_BINS) * 2)
        for (let k = 0; k < N2 / 2; k++) {
            tw[k * 2] = Math.cos((-2 * Math.PI * k) / N2)
            tw[k * 2 + 1] = Math.sin((-2 * Math.PI * k) / N2)
        }
        for (let k = 0; k < PADDED_BINS; k++) {
            tw[(N2 / 2 + k) * 2] = Math.cos((-2 * Math.PI * k) / FFT_SIZE)
            tw[(N2 / 2 + k) * 2 + 1] = Math.sin((-2 * Math.PI * k) / FFT_SIZE)
        }
        this.twiddle_buf = device.createBuffer({
            size: tw.byteLength,
            usage: storage,
            label: "twiddle"
        })
        device.queue.writeBuffer(this.twiddle_buf, 0, tw)

        const wsum = new Float32Array(ISTFT_LEN)
        for (let f = 0; f < PADDED_FRAMES; f++) {
            const start = f * HOP_SIZE
            for (let i = 0; i < FFT_SIZE && start + i < ISTFT_LEN; i++) {
                wsum[start + i] += hann[i] * hann[i]
            }
        }
        const recip = new Float32Array(ISTFT_LEN)
        for (let i = 0; i < ISTFT_LEN; i++) {
            recip[i] = wsum[i] > 1e-8 ? 1 / wsum[i] : 0
        }
        this.recip_buf = device.createBuffer({
            size: recip.byteLength,
            usage: storage,
            label: "wsum-recip"
        })
        device.queue.writeBuffer(this.recip_buf, 0, recip)

        const mk = (floats: number, label: string) =>
            device.createBuffer({ size: floats * 4, usage: storage, label })

        this.seg_buf = mk(2 * TRAINING_SAMPLES, "segment")
        this.stft_input_buf = mk(STFT_INPUT_LEN, "stft-input")
        this.centered_buf = mk(CENTERED_LEN, "centered")
        this.mag_spec_buf = mk(4 * PLANE, "magspec")
        this.frames_buf = mk(PADDED_FRAMES * FFT_SIZE, "ifft-frames")
        this.istft_time_buf = mk(ISTFT_LEN, "istft-time")

        this.build_static_binds()
    }

    public get waveform_buffer(): GPUBuffer {
        return this.seg_buf
    }

    public get mag_spec_buffer(): GPUBuffer {
        return this.mag_spec_buf
    }

    private static_uniform(data: Uint32Array): GPUBuffer {
        const buf = this.device.createBuffer({
            size: Math.max(16, data.byteLength),
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })
        this.device.queue.writeBuffer(buf, 0, data)
        return buf
    }

    private bind(pipe: ComputePipe, buffers: GPUBuffer[]): GPUBindGroup {
        return this.device.createBindGroup({
            layout: pipe.layout,
            entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } }))
        })
    }

    private build_static_binds(): void {
        this.pad1_binds = [0, 1].map((c) =>
            this.bind(this.pad, [
                this.seg_buf,
                this.stft_input_buf,
                this.static_uniform(
                    new Uint32Array([STFT_PAD, TRAINING_SAMPLES, STFT_INPUT_LEN, c * TRAINING_SAMPLES])
                )
            ])
        )
        this.pad2_bind = this.bind(this.pad, [
            this.stft_input_buf,
            this.centered_buf,
            this.static_uniform(new Uint32Array([CENTER_PAD, STFT_INPUT_LEN, CENTERED_LEN, 0]))
        ])
        this.stft_binds = [0, 1].map((c) =>
            this.bind(this.stft, [
                this.centered_buf,
                this.hann_buf,
                this.twiddle_buf,
                this.mag_spec_buf,
                this.static_uniform(new Uint32Array([c * 2, 0, 0, 0]))
            ])
        )
        this.ola_bind = this.bind(this.ola, [this.frames_buf, this.recip_buf, this.istft_time_buf])
        this.combine_uniforms = Array.from({ length: 8 }, () =>
            this.device.createBuffer({
                size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            })
        )
    }

    public write_segment(left: Float32Array, right: Float32Array): void {
        this.device.queue.writeBuffer(this.seg_buf, 0, left)
        this.device.queue.writeBuffer(this.seg_buf, TRAINING_SAMPLES * 4, right)
    }

    public encode_stft(encoder: GPUCommandEncoder, channel: number): void {
        const pass = encoder.beginComputePass()
        pass.setPipeline(this.pad.pipeline)
        pass.setBindGroup(0, this.pad1_binds[channel])
        pass.dispatchWorkgroups(wg_count(STFT_INPUT_LEN))

        pass.setBindGroup(0, this.pad2_bind)
        pass.dispatchWorkgroups(wg_count(CENTERED_LEN))

        pass.setPipeline(this.stft.pipeline)
        pass.setBindGroup(0, this.stft_binds[channel])
        pass.dispatchWorkgroups(TOTAL_FRAMES)
        pass.end()
    }

    public make_track_binds(
        freq_buf: GPUBuffer,
        time_buf: GPUBuffer,
        accs: GPUBuffer[][],
        weights_buf: GPUBuffer
    ): TrackBinds {
        const ifft_binds: GPUBindGroup[] = []
        const combine_binds: GPUBindGroup[] = []

        for (let t = 0; t < 4; t++) {
            for (let c = 0; c < 2; c++) {
                ifft_binds.push(
                    this.bind(this.ifft, [
                        freq_buf,
                        this.hann_buf,
                        this.twiddle_buf,
                        this.frames_buf,
                        this.static_uniform(new Uint32Array([t * 4 + c * 2, 0, 0, 0]))
                    ])
                )
                combine_binds.push(
                    this.bind(this.combine, [
                        time_buf,
                        this.istft_time_buf,
                        accs[t][c],
                        weights_buf,
                        this.combine_uniforms[t * 2 + c]
                    ])
                )
            }
        }
        return { ifft_binds, combine_binds }
    }

    public encode_post(
        encoder: GPUCommandEncoder,
        binds: TrackBinds,
        seg: { start: number; copy_len: number; segment_length: number; total_samples: number }
    ): void {
        for (let plane = 0; plane < 8; plane++) {
            const t = plane >> 1
            const c = plane & 1
            this.device.queue.writeBuffer(
                this.combine_uniforms[plane],
                0,
                new Uint32Array([
                    seg.start,
                    seg.copy_len,
                    seg.segment_length,
                    (t * 2 + c) * TRAINING_SAMPLES,
                    plane === 0 ? 1 : 0,
                    seg.total_samples,
                    0,
                    0
                ])
            )
            const pass = encoder.beginComputePass()
            pass.setPipeline(this.ifft.pipeline)
            pass.setBindGroup(0, binds.ifft_binds[plane])
            pass.dispatchWorkgroups(PADDED_FRAMES)

            pass.setPipeline(this.ola.pipeline)
            pass.setBindGroup(0, this.ola_bind)
            pass.dispatchWorkgroups(wg_count(ISTFT_LEN))

            pass.setPipeline(this.combine.pipeline)
            pass.setBindGroup(0, binds.combine_binds[plane])
            pass.dispatchWorkgroups(wg_count(seg.copy_len))
            pass.end()
        }
    }

    public encode_normalize(
        encoder: GPUCommandEncoder,
        acc: GPUBuffer,
        weights_buf: GPUBuffer,
        total_samples: number
    ): void {
        const bind = this.bind(this.norm, [
            weights_buf,
            acc,
            this.static_uniform(new Uint32Array([total_samples, 0, 0, 0]))
        ])
        const pass = encoder.beginComputePass()
        pass.setPipeline(this.norm.pipeline)
        pass.setBindGroup(0, bind)
        pass.dispatchWorkgroups(wg_count(total_samples))
        pass.end()
    }
}
