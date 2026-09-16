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
    phase: "manifest" | "downloading" | "initializing" | "ready"
    loaded_pieces: number
    total_pieces: number
    percent: number
    current_file?: string
}

export async function fetch_piece_with_cache(file_name: string): Promise<ArrayBuffer> {
    const url = `${HF_BASE_URL}/${file_name}`
    if (typeof caches !== "undefined") {
        try {
            const cache = await caches.open(CACHE_NAME)
            const cached_res = await cache.match(url)
            if (cached_res && cached_res.ok) {
                return await cached_res.arrayBuffer()
            }
            const res = await fetch(url)
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
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

export async function load_manifest(): Promise<SplitManifest> {
    const manifest_buf = await fetch_piece_with_cache("htdemucs_split_manifest.json")
    const manifest_text = new TextDecoder().decode(manifest_buf)
    return JSON.parse(manifest_text) as SplitManifest
}
