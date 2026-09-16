import { DEMUCS_CONSTANTS } from "./constants"

export function get_segment_starts(
    total_samples: number,
    segment: number = DEMUCS_CONSTANTS.TRAINING_SAMPLES,
    overlap: number = DEMUCS_CONSTANTS.SEGMENT_OVERLAP
): number[] {
    const stride = Math.floor(segment * (1 - overlap))
    const starts: number[] = []
    for (let s = 0; ; s += stride) {
        if (s + segment >= total_samples) {
            starts.push(Math.max(0, total_samples - segment))
            break
        }
        starts.push(s)
    }
    return starts
}
