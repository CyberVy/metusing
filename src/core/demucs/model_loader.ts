import type { ModelChain } from "./gpu_separator"

const HF_BASE_URL = "https://huggingface.co/monteslu/htdemucs-web-onnx/resolve/main"
const CACHE_NAME = "demucs-web-models-v1"

export const FP16_CPU_NODES = [
    "/ReduceMean",
    "/Sub",
    "/Pow",
    "/ReduceMean_1",
    "/Clip",
    "/Sqrt",
    "/Add",
    "/Div",
    "/ReduceMean_2",
    "/Sub_1",
    "/Pow_1",
    "/ReduceMean_3",
    "/Clip_1",
    "/Sqrt_1",
    "/Add_1",
    "/Div_1"
]

export interface ManifestPiece {
    file: string
    inputs: string[]
    outputs: string[]
}

export interface SplitManifest {
    pieces: ManifestPiece[]
    outputs: {
        freq: string
        time: string
    }
}

export interface ModelLoadProgress {
    phase: "manifest" | "downloading" | "cached" | "ready"
    loaded_pieces: number
    total_pieces: number
    percent: number
    current_file?: string
}

async function fetch_with_cache(url: string): Promise<ArrayBuffer> {
    if (typeof caches !== "undefined") {
        try {
            const cache = await caches.open(CACHE_NAME)
            const cached_res = await cache.match(url)
            if (cached_res && cached_res.ok) {
                return await cached_res.arrayBuffer()
            }
            const res = await fetch(url)
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
            // Clone before consuming arrayBuffer
            await cache.put(url, res.clone())
            return await res.arrayBuffer()
        } catch {
            // Fallback to plain fetch if cache fails
        }
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    return await res.arrayBuffer()
}

export async function load_htdemucs_chain(
    on_progress?: (progress: ModelLoadProgress) => void
): Promise<ModelChain> {
    on_progress?.({
        phase: "manifest",
        loaded_pieces: 0,
        total_pieces: 21,
        percent: 0,
        current_file: "htdemucs_split_manifest.json"
    })

    const manifest_url = `${HF_BASE_URL}/htdemucs_split_manifest.json`
    const manifest_buf = await fetch_with_cache(manifest_url)
    const manifest_text = new TextDecoder().decode(manifest_buf)
    const manifest: SplitManifest = JSON.parse(manifest_text)

    const total_pieces = manifest.pieces.length
    const buffers: ArrayBuffer[] = new Array(total_pieces)

    for (let i = 0; i < total_pieces; i++) {
        const piece = manifest.pieces[i]
        const piece_url = `${HF_BASE_URL}/${piece.file}`

        on_progress?.({
            phase: "downloading",
            loaded_pieces: i,
            total_pieces,
            percent: Math.round((i / total_pieces) * 100),
            current_file: piece.file
        })

        buffers[i] = await fetch_with_cache(piece_url)
    }

    on_progress?.({
        phase: "ready",
        loaded_pieces: total_pieces,
        total_pieces,
        percent: 100
    })

    return {
        pieces: manifest.pieces.map((p, i) => ({
            buf: buffers[i],
            inputs: p.inputs,
            outputs: p.outputs
        })),
        outputs: manifest.outputs
    }
}
