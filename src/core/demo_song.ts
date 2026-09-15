import type { LyricLine } from "./lyrics_parser"
import type { SongMetadata } from "./controllers/karaoke.controller"

const NOTE_FREQS: Record<string, number> = {
    C3: 130.81,
    E3: 164.81,
    F3: 174.61,
    G3: 196.00,
    A3: 220.00,
    B3: 246.94,
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.00,
    A4: 440.00,
    B4: 493.88,
    C5: 523.25
}

export const DEMO_LYRICS: LyricLine[] = [
    { start: 0.0, end: 4.8, text: "Twinkle, twinkle, little star" },
    { start: 5.0, end: 9.8, text: "How I wonder what you are" },
    { start: 10.0, end: 14.8, text: "Up above the world so high" },
    { start: 15.0, end: 19.8, text: "Like a diamond in the sky" },
    { start: 20.0, end: 24.8, text: "Twinkle, twinkle, little star" },
    { start: 25.0, end: 30.0, text: "How I wonder what you are" }
]

export const DEMO_METADATA: SongMetadata = {
    video_id: "demo-twinkle-star",
    title: "Twinkle Twinkle Little Star (Demo)",
    artist: "Metusing Studio",
    duration: 30.5,
    has_lyrics: true
}

interface NoteEvent {
    time: number
    duration: number
    freq: number
    gain?: number
}

function get_melody_events(): NoteEvent[] {
    const q = 0.625 // quarter note
    const h = 1.25  // half note

    const notes: [string, number][] = [
        // Phrase 1: Twinkle twinkle little star
        ["C4", q], ["C4", q], ["G4", q], ["G4", q],
        ["A4", q], ["A4", q], ["G4", h],
        // Phrase 2: How I wonder what you are
        ["F4", q], ["F4", q], ["E4", q], ["E4", q],
        ["D4", q], ["D4", q], ["C4", h],
        // Phrase 3: Up above the world so high
        ["G4", q], ["G4", q], ["F4", q], ["F4", q],
        ["E4", q], ["E4", q], ["D4", h],
        // Phrase 4: Like a diamond in the sky
        ["G4", q], ["G4", q], ["F4", q], ["F4", q],
        ["E4", q], ["E4", q], ["D4", h],
        // Phrase 5: Twinkle twinkle little star
        ["C4", q], ["C4", q], ["G4", q], ["G4", q],
        ["A4", q], ["A4", q], ["G4", h],
        // Phrase 6: How I wonder what you are
        ["F4", q], ["F4", q], ["E4", q], ["E4", q],
        ["D4", q], ["D4", q], ["C4", h]
    ]

    const events: NoteEvent[] = []
    let current_time = 0.0

    for (const [note, dur] of notes) {
        events.push({
            time: current_time,
            duration: dur * 0.9,
            freq: NOTE_FREQS[note] ?? 261.63,
            gain: 0.28
        })
        current_time += dur
    }

    return events
}

interface ChordBar {
    bass: string
    triad: string[]
}

function get_accompaniment_chords(): ChordBar[] {
    const c_major: ChordBar = { bass: "C3", triad: ["G3", "C4", "E4"] }
    const f_major: ChordBar = { bass: "F3", triad: ["A3", "C4", "F4"] }
    const g_major: ChordBar = { bass: "G3", triad: ["B3", "D4", "G4"] }

    return [
        // Bars 1-2
        c_major, f_major,
        // Bars 3-4
        f_major, c_major,
        // Bars 5-6
        c_major, g_major,
        // Bars 7-8
        c_major, g_major,
        // Bars 9-10
        c_major, f_major,
        // Bars 11-12
        f_major, c_major
    ]
}

function render_synth_note(
    ctx: OfflineAudioContext,
    destination: AudioNode,
    event: NoteEvent,
    type: OscillatorType,
    vibrato = false
): void {
    const osc = ctx.createOscillator()
    const gain_node = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(event.freq, event.time)

    if (vibrato) {
        const lfo = ctx.createOscillator()
        const lfo_gain = ctx.createGain()
        lfo.frequency.setValueAtTime(5, event.time) // 5 Hz vibrato
        lfo_gain.gain.setValueAtTime(2.5, event.time) // 2.5 Hz deviation
        lfo.connect(osc.frequency)
        lfo.start(event.time)
        lfo.stop(event.time + event.duration)
    }

    const max_gain = event.gain ?? 0.2
    const attack = 0.04
    const decay = 0.15
    const sustain = 0.75 * max_gain
    const release = 0.08

    gain_node.gain.setValueAtTime(0.0001, event.time)
    gain_node.gain.linearRampToValueAtTime(max_gain, event.time + attack)
    gain_node.gain.linearRampToValueAtTime(sustain, event.time + attack + decay)
    gain_node.gain.setValueAtTime(sustain, event.time + event.duration - release)
    gain_node.gain.linearRampToValueAtTime(0.0001, event.time + event.duration)

    osc.connect(gain_node)
    gain_node.connect(destination)

    osc.start(event.time)
    osc.stop(event.time + event.duration)
}

function audio_buffer_to_wav_blob(buffer: AudioBuffer): Blob {
    const num_channels = buffer.numberOfChannels
    const sample_rate = buffer.sampleRate
    const length = buffer.length * num_channels * 2
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
    view.setUint32(16, 16, true) // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true)  // AudioFormat (1 for PCM)
    view.setUint16(22, num_channels, true)
    view.setUint32(24, sample_rate, true)
    view.setUint32(28, sample_rate * num_channels * 2, true) // ByteRate
    view.setUint16(32, num_channels * 2, true) // BlockAlign
    view.setUint16(34, 16, true) // BitsPerSample
    write_string(36, "data")
    view.setUint32(40, length, true)

    let offset = 44
    const channel_data: Float32Array[] = []
    for (let c = 0; c < num_channels; c++) {
        channel_data.push(buffer.getChannelData(c))
    }

    for (let i = 0; i < buffer.length; i++) {
        for (let c = 0; c < num_channels; c++) {
            const sample = Math.max(-1, Math.min(1, channel_data[c][i]))
            const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
            view.setInt16(offset, int16, true)
            offset += 2
        }
    }

    return new Blob([array_buffer], { type: "audio/wav" })
}

let cached_demo_data: {
    instrumental_blob: Blob
    vocals_blob: Blob
    lyrics: LyricLine[]
    meta: SongMetadata
} | null = null

export async function generate_demo_song(): Promise<{
    instrumental_blob: Blob
    vocals_blob: Blob
    lyrics: LyricLine[]
    meta: SongMetadata
}> {
    if (cached_demo_data) {
        return cached_demo_data
    }

    const sample_rate = 44100
    const total_duration = 30.5
    const total_samples = Math.ceil(sample_rate * total_duration)

    // 1. Render Accompaniment Context (Instrumental)
    const inst_ctx = new OfflineAudioContext(2, total_samples, sample_rate)
    const inst_gain = inst_ctx.createGain()
    inst_gain.gain.setValueAtTime(0.7, 0)
    inst_gain.connect(inst_ctx.destination)

    const chords = get_accompaniment_chords()
    const bar_duration = 2.5
    for (let bar_idx = 0; bar_idx < chords.length; bar_idx++) {
        const bar = chords[bar_idx]
        const bar_start = bar_idx * bar_duration

        // Bass root note on beat 1
        const bass_freq = NOTE_FREQS[bar.bass] ?? 130.81
        render_synth_note(
            inst_ctx,
            inst_gain,
            { time: bar_start, duration: 2.2, freq: bass_freq, gain: 0.3 },
            "triangle"
        )

        // Arpeggiated / struck chord notes on beats 1, 2, 3, 4
        for (let beat = 0; beat < 4; beat++) {
            const beat_time = bar_start + beat * 0.625
            const note_name = bar.triad[beat % bar.triad.length]
            const freq = NOTE_FREQS[note_name] ?? 261.63
            render_synth_note(
                inst_ctx,
                inst_gain,
                { time: beat_time, duration: 0.5, freq, gain: 0.15 },
                "sine"
            )
        }
    }

    const inst_rendered = await inst_ctx.startRendering()
    const instrumental_blob = audio_buffer_to_wav_blob(inst_rendered)

    // 2. Render Full Mix Context (Accompaniment + Guide Vocal)
    const vocal_ctx = new OfflineAudioContext(2, total_samples, sample_rate)
    const vocal_inst_gain = vocal_ctx.createGain()
    vocal_inst_gain.gain.setValueAtTime(0.6, 0)
    vocal_inst_gain.connect(vocal_ctx.destination)

    // Render chords in vocal_ctx as well
    for (let bar_idx = 0; bar_idx < chords.length; bar_idx++) {
        const bar = chords[bar_idx]
        const bar_start = bar_idx * bar_duration
        const bass_freq = NOTE_FREQS[bar.bass] ?? 130.81
        render_synth_note(
            vocal_ctx,
            vocal_inst_gain,
            { time: bar_start, duration: 2.2, freq: bass_freq, gain: 0.3 },
            "triangle"
        )
        for (let beat = 0; beat < 4; beat++) {
            const beat_time = bar_start + beat * 0.625
            const note_name = bar.triad[beat % bar.triad.length]
            const freq = NOTE_FREQS[note_name] ?? 261.63
            render_synth_note(
                vocal_ctx,
                vocal_inst_gain,
                { time: beat_time, duration: 0.5, freq, gain: 0.15 },
                "sine"
            )
        }
    }

    // Render melody notes with vibrato
    const melody_gain = vocal_ctx.createGain()
    melody_gain.gain.setValueAtTime(0.8, 0)
    melody_gain.connect(vocal_ctx.destination)

    const melody_events = get_melody_events()
    for (const event of melody_events) {
        render_synth_note(vocal_ctx, melody_gain, event, "triangle", true)
    }

    const vocal_rendered = await vocal_ctx.startRendering()
    const vocals_blob = audio_buffer_to_wav_blob(vocal_rendered)

    cached_demo_data = {
        instrumental_blob,
        vocals_blob,
        lyrics: DEMO_LYRICS,
        meta: DEMO_METADATA
    }

    return cached_demo_data
}
