const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const

export interface PitchDetectionResult {
    pitch_hz: number
    note_name: string
    octave: number
    full_name: string
    cents: number
    clarity: number
}

/**
 * Converts a frequency in Hz to musical note notation (e.g. 440Hz -> A4, 65.4Hz -> C2).
 */
export function frequency_to_note(freq_hz: number): { note_name: string; octave: number; full_name: string; cents: number } {
    const midi = 69 + 12 * Math.log2(freq_hz / 440)
    const rounded_midi = Math.round(midi)
    const note_idx = ((rounded_midi % 12) + 12) % 12
    const octave = Math.floor(rounded_midi / 12) - 1
    const note_name = NOTE_NAMES[note_idx]
    
    const standard_freq = 440 * Math.pow(2, (rounded_midi - 69) / 12)
    const cents = Math.round(1200 * Math.log2(freq_hz / standard_freq))
    
    return {
        note_name,
        octave,
        full_name: `${note_name}${octave}`,
        cents
    }
}

/**
 * Amplitude-normalized autocorrelation algorithm with calibrated noise gate
 * and sub-sample parabolic interpolation.
 * Tuned for singing voice across all microphone types: 65 Hz (C2) to 988 Hz (B5).
 */
export function extract_pitch_autocorrelation(
    buffer: Float32Array,
    sample_rate: number,
    min_rms = 0.006
): PitchDetectionResult | null {
    const size = buffer.length
    let sum_squares = 0
    for (let i = 0; i < size; i++) {
        sum_squares += buffer[i] * buffer[i]
    }
    const rms = Math.sqrt(sum_squares / size)
    
    // Ambient noise gate: 0.006 (-44.4 dBFS) filters room noise while capturing gentle singing and headset mics
    if (rms < min_rms) {
        return null
    }

    // Human singing voice range: roughly 65 Hz (C2) to 988 Hz (B5)
    const min_period = Math.max(2, Math.floor(sample_rate / 988))
    const max_period = Math.min(size - 2, Math.floor(sample_rate / 65))

    let best_offset = -1
    let best_correlation = 0
    let prev_correlation = 0
    let is_increasing = false

    // Track correlations for sub-sample parabolic peak refinement
    const correlations = new Float32Array(max_period + 2)

    for (let offset = min_period; offset <= max_period; offset++) {
        let diff = 0
        let sum = 0
        const limit = size - offset
        for (let i = 0; i < limit; i++) {
            const v1 = buffer[i]
            const v2 = buffer[i + offset]
            diff += Math.abs(v1 - v2)
            sum += Math.abs(v1) + Math.abs(v2)
        }

        // True amplitude-normalized correlation (scale-invariant)
        const correlation = sum > 0.0001 ? 1 - (diff / sum) : 0
        correlations[offset] = correlation

        // Peak picking: detect local maximum
        if (correlation > prev_correlation) {
            is_increasing = true
        } else if (is_increasing && prev_correlation > 0.82) {
            const candidate_offset = offset - 1
            const candidate_correlation = prev_correlation

            if (candidate_correlation > best_correlation) {
                best_correlation = candidate_correlation
                best_offset = candidate_offset
            }
            is_increasing = false

            // If we found a very confident fundamental peak (> 0.90),
            // prefer the fundamental over subsequent octave sub-harmonics
            if (candidate_correlation > 0.90) {
                break
            }
        }
        prev_correlation = correlation
    }

    if (best_offset !== -1 && best_correlation >= 0.82) {
        // Parabolic interpolation for sub-sample cents accuracy
        let refined_offset = best_offset
        if (best_offset > min_period && best_offset < max_period) {
            const alpha = correlations[best_offset - 1]
            const beta = correlations[best_offset]
            const gamma = correlations[best_offset + 1]
            const denom = 2 * (2 * beta - alpha - gamma)
            if (Math.abs(denom) > 0.00001) {
                const delta = (alpha - gamma) / denom
                refined_offset = best_offset + delta
            }
        }

        const pitch_hz = sample_rate / refined_offset
        
        if (pitch_hz >= 65 && pitch_hz <= 988) {
            const note_info = frequency_to_note(pitch_hz)
            return {
                pitch_hz: Math.round(pitch_hz * 10) / 10,
                note_name: note_info.note_name,
                octave: note_info.octave,
                full_name: note_info.full_name,
                cents: note_info.cents,
                clarity: Math.round(best_correlation * 100) / 100
            }
        }
    }

    return null
}
