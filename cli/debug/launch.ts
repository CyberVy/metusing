import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEBUG_DIR = path.resolve(__dirname, "../../.debug")
const LOGS_FILE = path.join(DEBUG_DIR, "logs.jsonl")
const HISTORY_FILE = path.join(DEBUG_DIR, "history.jsonl")
const CONFIG_FILE = path.join(DEBUG_DIR, "config.json")

let config = { port: 9999 }
try {
    if (fs.existsSync(CONFIG_FILE)){
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
    }
}
catch (err){
    console.error("[Debug Server] Failed to read connection config:", err)
}

const PORT = config.port

function get_lan_ip(): string | null{
    const interfaces = os.networkInterfaces()
    for (const dev in interfaces){
        const iface = interfaces[dev]
        if (iface){
            for (const details of iface){
                if (details.family === "IPv4" && !details.internal){
                    return details.address
                }
            }
        }
    }
    return null
}

let client_res: http.ServerResponse | null = null

interface PendingEval {
    res: http.ServerResponse
    code: string
    timeout: NodeJS.Timeout
}

const pending_evals = new Map<string, PendingEval>()

function log_eval_history(id: string, code: string, success: boolean, result: any){
    try {
        const entry = JSON.stringify({
            timestamp: Date.now(),
            id,
            code,
            success,
            result,
        })
        fs.appendFileSync(HISTORY_FILE, entry + "\n", "utf8")
    }
    catch (err){
        try {
            const entry = JSON.stringify({
                timestamp: Date.now(),
                id,
                code,
                success,
                result: String(result),
            })
            fs.appendFileSync(HISTORY_FILE, entry + "\n", "utf8")
        }
        catch (e){
            console.error("[Debug Server] Failed to write history log:", e)
        }
    }
}

// Ensure the .debug directory exists
if (!fs.existsSync(DEBUG_DIR)){
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
}

const server = http.createServer((req, res) => {
    // Enable CORS for frontend connection
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    if (req.method === "OPTIONS"){
        res.writeHead(200)
        res.end()
        return
    }

    if (req.url === "/eval" && req.method === "POST"){
        let body = ""
        req.on("data", (chunk) => {
            body += chunk
        })
        req.on("end", () => {
            try {
                const payload = JSON.parse(body)
                const code = payload.code

                if (!code){
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ success: false, error: "Missing code parameter" }))
                    return
                }

                if (!client_res){
                    res.writeHead(503, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ success: false, error: "No active browser session connected to debug bridge" }))
                    return
                }

                const req_id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

                const timeout = setTimeout(() => {
                    const pending = pending_evals.get(req_id)
                    if (pending){
                        pending.res.writeHead(504, { "Content-Type": "application/json" })
                        pending.res.end(JSON.stringify({ success: false, error: "Evaluation timed out waiting for browser response" }))
                        pending_evals.delete(req_id)
                        log_eval_history(req_id, code, false, "Timeout")
                    }
                }, 15000)

                pending_evals.set(req_id, { res, code, timeout })

                // Push command payload via SSE to the browser
                client_res.write(`data: ${JSON.stringify({ id: req_id, code })}\n\n`)
            }
            catch (err){
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ success: false, error: "Invalid JSON payload" }))
            }
        })
        return
    }

    if (req.url === "/events"){
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })
        client_res = res
        req.on("close", () => {
            if (client_res === res){
                client_res = null
            }
        })
        return
    }

    if (req.url === "/respond" && req.method === "POST"){
        let body = ""
        req.on("data", (chunk) => {
            body += chunk
        })
        req.on("end", () => {
            try {
                const payload = JSON.parse(body)
                const { id, success, result } = payload
                const pending = pending_evals.get(id)

                if (pending){
                    clearTimeout(pending.timeout)
                    pending.res.writeHead(200, { "Content-Type": "application/json" })
                    pending.res.end(JSON.stringify({ success, result }))
                    pending_evals.delete(id)
                    log_eval_history(id, pending.code, success, result)
                }

                res.writeHead(200, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ status: "ok" }))
            }
            catch (err){
                res.writeHead(500)
                res.end(String(err))
            }
        })
        return
    }

    if (req.url === "/log" && req.method === "POST"){
        let body = ""
        req.on("data", (chunk) => {
            body += chunk
        })
        req.on("end", () => {
            try {
                fs.appendFileSync(LOGS_FILE, body + "\n", "utf8")
                res.writeHead(200, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ status: "ok" }))
            }
            catch (err){
                res.writeHead(500)
                res.end(String(err))
            }
        })
        return
    }

    res.writeHead(404)
    res.end()
})

server.on("listening", () => {
    const lan_ip = get_lan_ip()
    console.log("[Debug Server] Running on:")
    console.log(`  - Local:   http://localhost:${PORT}`)
    if (lan_ip){
        console.log(`  - Network: http://${lan_ip}:${PORT}`)
    }
    console.log(`[Debug Server] Communication directory: ${DEBUG_DIR}`)
})

server.on("error", (err: any) => {
    console.error("[Debug Server] Server error:", err)
})

server.listen(PORT, "0.0.0.0")
