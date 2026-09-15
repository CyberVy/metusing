import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import fs from "node:fs"

function debug_bridge_plugin(): Plugin{
    return {
        name: "debug-bridge",
        apply: "serve",
        transformIndexHtml(_html, ctx){
            return [
                {
                    tag: "script",
                    attrs: { src: "/debug_bridge.js" },
                    injectTo: "head-prepend"
                }
            ]
        },
        configureServer(server){
            const config_path = path.resolve(import.meta.dirname, ".debug/config.json")
            const template_path = path.resolve(import.meta.dirname, "cli/debug/debug_bridge_template.js")
            server.middlewares.use((req, res, next) => {
                if (req.url !== "/debug_bridge.js") return next()
                try {
                    const { port } = JSON.parse(fs.readFileSync(config_path, "utf8"))
                    const content = fs.readFileSync(template_path, "utf8").replace("{{PORT}}", String(port))
                    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" })
                    res.end(content)
                }
                catch {
                    res.writeHead(404)
                    res.end()
                }
            })
        }
    }
}

export default defineConfig({
    root: path.resolve(import.meta.dirname, "src/app"),
    publicDir: path.resolve(import.meta.dirname, "public"),
    plugins: [
        debug_bridge_plugin(),
        react({
            compiler: true
        }),
        {
            name: "native-entry-handler",
            configureServer(server){
                server.middlewares.use((req, _res, next) => {
                    if (req.url === "/native_entry" || req.url === "/native_entry/"){
                        req.url = "/native_entry/index.html"
                    }
                    next()
                })
            },
            closeBundle(){
                const out_dir = path.resolve(import.meta.dirname, "dist")
                const src_file = path.join(out_dir, "native_entry/index.html")
                const dest_file = path.join(out_dir, "native_entry.html")
                if (fs.existsSync(src_file)){
                    fs.copyFileSync(src_file, dest_file)
                }
            }
        }
    ],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src")
        }
    },
    server: {
        port: 4000,
        host: "0.0.0.0",
        fs: {
            allow: [path.resolve(import.meta.dirname)]
        }
    },
    build: {
        outDir: path.resolve(import.meta.dirname, "dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(import.meta.dirname, "src/app/index.html"),
                native_entry: path.resolve(import.meta.dirname, "src/app/native_entry/index.html")
            }
        }
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
        "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toUTCString()),
        "import.meta.env.VITE_NATIVE_ENTRY_URL": JSON.stringify("/")
    }
})
