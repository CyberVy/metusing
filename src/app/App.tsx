import { ViewSwitcher } from "@/components"
import type { View } from "@/components"
import { PitchView, LyricsView, MusicIcon, MicIcon } from "@/blocks"

export default function App() {
    const views: View[] = [
        {
            id: "pitch",
            label: (
                <span className="flex items-center gap-1.5">
                    <MicIcon className="w-3.5 h-3.5" />
                    <span>Pitch</span>
                </span>
            ),
            content: <PitchView />,
            keep_alive: true
        },
        {
            id: "sing",
            label: (
                <span className="flex items-center gap-1.5">
                    <MusicIcon className="w-3.5 h-3.5" />
                    <span>Sing</span>
                </span>
            ),
            content: <LyricsView />,
            keep_alive: true
        }
    ]

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-start pt-4 sm:pt-6 md:pt-8 pb-24 font-sans antialiased selection:bg-white selection:text-black">
            <div className="w-full flex flex-col gap-5">
                {/* Header */}
                <header className="flex items-center justify-between mx-4 sm:mx-6 md:mx-8 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold">
                            <MusicIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold tracking-tight text-white">Metusing</h1>
                            <p className="text-xs text-white/40">Karaoke & Pitch Studio</p>
                        </div>
                    </div>
                    <div className="text-xs font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-white/50">
                        MVP v0.1
                    </div>
                </header>

                {/* View Switcher: Pitch Studio vs Karaoke Sing */}

                <ViewSwitcher
                    id="main-view-switcher"
                    views={views}
                    default_active_view_id="pitch"
                    keep_alive_default={true}
                    toolbar_item_className="w-20 sm:w-24 h-9"
                />

            </div>
        </div>
    )
}
