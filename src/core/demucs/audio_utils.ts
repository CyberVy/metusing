import { DEMUCS_CONSTANTS } from "./constants"

export interface DecodedStereoAudio {
    left: Float32Array
    right: Float32Array
    duration: number
    sample_rate: number
}

export async function decode_audio_to_stereo(
    data: ArrayBuffer | Blob
): Promise<DecodedStereoAudio> {
    const array_buffer = data instanceof Blob ? await data.arrayBuffer() : data
    const temp_ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    
    try {
        const decoded = await temp_ctx.decodeAudioData(array_buffer.slice(0))
        const target_rate = DEMUCS_CONSTANTS.SAMPLE_RATE

        // Resample to 44100Hz if needed
        if (decoded.sampleRate === target_rate && decoded.numberOfChannels === 2) {
            return {
                left: decoded.getChannelData(0),
                right: decoded.getChannelData(1),
                duration: decoded.duration,
                sample_rate: target_rate
            }
        }

        const total_target_samples = Math.ceil(decoded.duration * target_rate)
        const offline_ctx = new OfflineAudioContext(2, total_target_samples, target_rate)
        const source = offline_ctx.createBufferSource()
        source.buffer = decoded
        source.connect(offline_ctx.destination)
        source.start(0)

        const rendered = await offline_ctx.startRendering()
        return {
            left: rendered.getChannelData(0),
            right: rendered.getChannelData(1),
            duration: rendered.duration,
            sample_rate: target_rate
        }
    } finally {
        void temp_ctx.close()
    }
}

export function audio_channels_to_wav_blob(
    channels: { left: Float32Array; right: Float32Array },
    sample_rate: number = DEMUCS_CONSTANTS.SAMPLE_RATE
): Blob {
    const num_channels = 2
    const total_samples = channels.left.length
    const length = total_samples * num_channels * 2
    const array_buffer = new ArrayBuffer(44 + length)
    const view = new DataView(array_buffer)

    const write_string = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i))
        }
    }

    // RIFF identifier
    write_string(0, "RIFF")
    view.setUint32(4, 36 + length, true)
    write_string(8, "WAVE")
    write_string(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM format
    view.setUint16(22, num_channels, true)
    view.setUint32(24, sample_rate, true)
    view.setUint32(28, sample_rate * num_channels * 2, true) // Byte rate
    view.setUint16(32, num_channels * 2, true) // Block align
    view.setUint16(34, 16, true) // Bits per sample
    write_string(36, "data")
    view.setUint32(40, length, true)

    let offset = 44
    for (let i = 0; i < total_samples; i++) {
        // Left
        const s_l = Math.max(-1, Math.min(1, channels.left[i] ?? 0))
        view.setInt16(offset, s_l < 0 ? s_l * 0x8000 : s_l * 0x7FFF, true)
        offset += 2

        // Right
        const s_r = Math.max(-1, Math.min(1, channels.right[i] ?? 0))
        view.setInt16(offset, s_r < 0 ? s_r * 0x8000 : s_r * 0x7FFF, true)
        offset += 2
    }

    return new Blob([array_buffer], { type: "audio/wav" })
}
