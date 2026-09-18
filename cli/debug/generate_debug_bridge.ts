import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { find_free_port, get_debug_port } from "./launch.ts"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEBUG_DIR = path.resolve(__dirname, "../../.debug")
const CONFIG_FILE = path.join(DEBUG_DIR, "config.json")

// Ensure .debug exists
if (!fs.existsSync(DEBUG_DIR)){
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
}

async function main(){
    try {
        const host = "0.0.0.0"
        const start_port = get_debug_port()
        const port = await find_free_port(start_port, host)

        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ port }, null, 2), "utf8")
        console.log(`[Debug Bridge Init] Reserved debug bridge port ${port}, written to .debug/config.json`)
    }
    catch (err){
        console.error("[Debug Bridge Init] Initialization failed:", err)
        process.exit(1)
    }
}

main()
