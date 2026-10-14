import { useSyncExternalStore } from "react"
import { pitch_controller, type PitchSnapshot } from "./pitch.controller"
import { karaoke_controller, type KaraokeSnapshot } from "./karaoke.controller"

export * from "./pitch.controller"
export * from "./karaoke.controller"

export function usePitchState(): PitchSnapshot {
    return useSyncExternalStore(
        pitch_controller.subscribe,
        pitch_controller.get_snapshot,
        pitch_controller.get_snapshot
    )
}

export function useKaraokeState(): KaraokeSnapshot {
    return useSyncExternalStore(
        karaoke_controller.subscribe,
        karaoke_controller.get_snapshot,
        karaoke_controller.get_snapshot
    )
}
