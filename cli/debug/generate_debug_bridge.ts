import fs from "node:fs"
import path from "node:path"
import net from "node:net"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEBUG_DIR = path.resolve(__dirname, "../../.debug")
const CONFIG_FILE = path.join(DEBUG_DIR, "config.json")

// Ensure .debug exists
if (!fs.existsSync(DEBUG_DIR)){
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
}

function get_debug_port(): number{
    const arg = process.argv.find((a) => a.startsWith("--debug-port="))
    if (arg){
        const val = parseInt(arg.split("=")[1], 10)
        if (!isNaN(val)) return val
    }
    if (process.env.npm_config_debug_port){
        const val = parseInt(process.env.npm_config_debug_port, 10)
        if (!isNaN(val)) return val
    }
    return 9999
}

function find_free_port(start_port: number, host: string): Promise<number>{
    return new Promise((resolve) => {
        const server = net.createServer()
        server.unref()
        server.on("error", () => {
            resolve(find_free_port(start_port + 1, host))
        })
        server.listen(start_port, host, () => {
            const address = server.address()
            const port = typeof address === "string" ? start_port : address?.port || start_port
            server.close(() => {
                resolve(port)
            })
        })
    })
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
