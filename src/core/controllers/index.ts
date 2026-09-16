import { useSyncExternalStore } from "react"
import { pitch_controller, type PitchSnapshot } from "./pitch.controller"
import { karaoke_controller, type KaraokeSnapshot } from "./karaoke.controller"
import { separation_controller, type SeparationSnapshot } from "./separation.controller"

export * from "./pitch.controller"
export * from "./karaoke.controller"
export * from "./separation.controller"

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

export function useSeparationState(): SeparationSnapshot {
    return useSyncExternalStore(
        separation_controller.subscribe,
        separation_controller.get_snapshot,
        separation_controller.get_snapshot
    )
}
