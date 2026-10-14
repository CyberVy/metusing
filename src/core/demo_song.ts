import { parse_json_lyrics, type LyricLine } from "./lyrics_parser"
import type { SongMetadata } from "./controllers/karaoke.controller"

export interface DemoSongInfo extends SongMetadata {
    instrumental_url: string
    vocals_url: string
    lyrics_url: string
}

export const DEMO_SONGS: DemoSongInfo[] = [
    {
        video_id: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        artist: "Rick Astley",
        duration: 213,
        has_lyrics: true,
        instrumental_url: "/songs/dQw4w9WgXcQ/instrumental.mp3",
        vocals_url: "/songs/dQw4w9WgXcQ/vocals.mp3",
        lyrics_url: "/songs/dQw4w9WgXcQ/lyrics.json"
    },
    {
        video_id: "Ki_PFGEWe2k",
        title: "“L-O-V-E” (Jazz Standard Cover)",
        artist: "Robyn Adele Anderson",
        duration: 239,
        has_lyrics: true,
        instrumental_url: "/songs/Ki_PFGEWe2k/instrumental.mp3",
        vocals_url: "/songs/Ki_PFGEWe2k/vocals.mp3",
        lyrics_url: "/songs/Ki_PFGEWe2k/lyrics.json"
    }
]

export const DEFAULT_DEMO_SONG = DEMO_SONGS[0]

export interface DemoSongResult {
    instrumental: string
    vocals: string
    instrumental_blob?: Blob
    vocals_blob?: Blob
    lyrics: LyricLine[]
    meta: SongMetadata
}

const lyrics_cache = new Map<string, LyricLine[]>()

export async function fetch_demo_lyrics(lyrics_url: string): Promise<LyricLine[]> {
    const cached = lyrics_cache.get(lyrics_url)
    if (cached) {
        return cached
    }

    try {
        const res = await fetch(lyrics_url)
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching lyrics`)
        }
        const text = await res.text()
        const parsed = parse_json_lyrics(text) ?? []
        lyrics_cache.set(lyrics_url, parsed)
        return parsed
    } catch (err) {
        console.warn("[DemoSong] Failed to fetch lyrics:", err)
        return []
    }
}

export async function generate_demo_song(video_id?: string): Promise<DemoSongResult> {
    const target = (video_id && DEMO_SONGS.find((s) => s.video_id === video_id)) || DEFAULT_DEMO_SONG
    const lyrics = await fetch_demo_lyrics(target.lyrics_url)

    const meta: SongMetadata = {
        video_id: target.video_id,
        title: target.title,
        artist: target.artist,
        duration: target.duration,
        has_lyrics: lyrics.length > 0
    }

    return {
        instrumental: target.instrumental_url,
        vocals: target.vocals_url,
        lyrics,
        meta
    }
}
