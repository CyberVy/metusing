export const DEMUCS_CONSTANTS = {
    SAMPLE_RATE: 44100,
    FFT_SIZE: 4096,
    HOP_SIZE: 1024,
    TRAINING_SAMPLES: 343980, // ~7.8 seconds at 44.1kHz
    MODEL_SPEC_BINS: 2048,
    MODEL_SPEC_FRAMES: 336,
    SEGMENT_OVERLAP: 0.25,
    TRACKS: ["drums", "bass", "other", "vocals"] as const
} as const

export type DemucsTrackName = typeof DEMUCS_CONSTANTS.TRACKS[number]
