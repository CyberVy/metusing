export interface LyricLine {
    start: number
    end: number
    text: string
}

/**
 * Parses LRC formatted text into timed LyricLine array.
 * Supported format: [mm:ss.xx] Lyrics text
 */
export function parse_lrc(lrc_text: string): LyricLine[] {
    const lines = lrc_text.split(/\r?\n/)
    const raw_entries: { time: number; text: string }[] = []

    const time_tag_regex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Extract all timestamps from the line (LRC lines can have multiple [00:12.34][00:45.67] tags)
        const matches = [...trimmed.matchAll(time_tag_regex)]
        if (matches.length === 0) continue

        // Text is whatever follows after the last timestamp tag
        const text = trimmed.replace(time_tag_regex, "").trim()
        if (!text) continue

        for (const match of matches) {
            const minutes = parseInt(match[1], 10)
            const seconds = parseInt(match[2], 10)
            let fraction = 0
            if (match[3]) {
                const frac_str = match[3]
                fraction = frac_str.length === 2 ? parseInt(frac_str, 10) / 100 : parseInt(frac_str, 10) / 1000
            }
            const total_seconds = minutes * 60 + seconds + fraction
            raw_entries.push({ time: Math.round(total_seconds * 100) / 100, text })
        }
    }

    if (raw_entries.length === 0) {
        return []
    }

    // Sort chronologically by start time
    raw_entries.sort((a, b) => a.time - b.time)

    const result: LyricLine[] = []
    for (let i = 0; i < raw_entries.length; i++) {
        const cur = raw_entries[i]
        const next = raw_entries[i + 1]
        // End time is either start of next line or cur.time + 4.0 seconds for final line
        const end_time = next ? next.time : cur.time + 4.0
        result.push({
            start: cur.time,
            end: Math.max(cur.time + 0.5, end_time),
            text: cur.text
        })
    }

    return result
}

/**
 * Parses raw JSON string into LyricLine array if valid.
 */
export function parse_json_lyrics(json_text: string): LyricLine[] | null {
    try {
        const parsed = JSON.parse(json_text)
        if (!Array.isArray(parsed)) return null

        const valid_lines: LyricLine[] = []
        for (const item of parsed) {
            if (
                typeof item === "object" &&
                item !== null &&
                typeof item.text === "string" &&
                typeof item.start === "number"
            ) {
                const end = typeof item.end === "number" ? item.end : item.start + 3.0
                valid_lines.push({
                    start: item.start,
                    end,
                    text: item.text.trim()
                })
            }
        }
        return valid_lines.length > 0 ? valid_lines : null
    } catch {
        return null
    }
}

/**
 * Universal lyrics parser: handles JSON or LRC text format.
 */
export function parse_lyrics(content: string): LyricLine[] {
    const trimmed = content.trim()
    if (!trimmed) {
        return []
    }

    if (trimmed.startsWith("[") && trimmed.includes("{")) {
        const json_res = parse_json_lyrics(trimmed)
        if (json_res) {
            return json_res
        }
    }

    return parse_lrc(trimmed)
}
