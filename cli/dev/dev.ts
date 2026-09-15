/**
 * Development Server Orchestrator / Launcher
 * 
 * Usage:
 *   npx tsx cli/dev/dev.ts [options]
 *   npm run dev -- [options]
 * 
 * Supported Options:
 *   -p, --port=<port>       Overrides the Vite development server port (default is 4000)
 *   --debug-port=<port>     The starting port to probe for the debug bridge server (default is 9999)
 * 
 * Example:
 *   npm run dev -- --port=3500 --debug-port=10000
 */
import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import concurrently from "concurrently"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function get_server_port(): string | null{
    let port_arg_index = -1
    for (let i = process.argv.length - 1; i >= 0; i--){
        if (process.argv[i].startsWith("--port=") || process.argv[i] === "-p"){
            port_arg_index = i
            break
        }
    }
    if (port_arg_index !== -1){
        const arg = process.argv[port_arg_index]
        if (arg.startsWith("--port=")){
            return arg.split("=")[1]
        }
        else if (port_arg_index + 1 < process.argv.length){
            return process.argv[port_arg_index + 1]
        }
    }
    if (process.env.npm_config_port){
        return process.env.npm_config_port
    }
    return null
}

async function main(){
    try {
        const port = get_server_port() || "4000"
        const vite_dev_cmd = `npx vite --port ${port}`

        // Filter out Vite port args from being forwarded to the debug bridge
        const debug_args = process.argv.slice(2).filter((arg, index, arr) => {
            if (arg.startsWith("--port=") || arg.startsWith("-p=")) return false
            if (arg === "-p" || arg === "--port") return false
            const prev = arr[index - 1]
            if (prev === "-p" || prev === "--port") return false
            return true
        }).join(" ")

        // 1. Run generate_debug_bridge first
        execSync(`npx tsx ${path.join(__dirname, "../debug/generate_debug_bridge.ts")} ${debug_args}`, {
            stdio: "inherit"
        })

        // 2. Run concurrently
        const { result } = concurrently([
            { command: "npm run dev:sw", name: "sw", prefixColor: "cyan" },
            { command: vite_dev_cmd, name: "vite", prefixColor: "green" },
            { command: `npx tsx ${path.join(__dirname, "../debug/launch.ts")} ${debug_args}`, name: "debug", prefixColor: "yellow" }
        ], {
            killOthersOn: ["failure", "success"],
        })

        await result
    }
    catch (err){
        console.error("[Dev Runner] Error:", err)
        process.exit(1)
    }
}

main()
