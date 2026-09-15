# Developer Guide: Frontend Debug Bridge

To facilitate bidirectional communication between the **Frontend Browser Context (Webview)** and the **AI Agent (Host Sandbox)** during development, this project implements a lightweight, zero-dependency, and non-intrusive **Debug Bridge**.

---

## 1. How the Mechanism Works

The communication runs purely on standard web protocols (Server-Sent Events & HTTP POST) and is handled by a Node.js development sidecar. During development, Vite serves `/debug_bridge.js` dynamically from the client template after injecting the selected debug port. It keeps the core React frontend codebase (`src/core`, `src/infra`, `src/app/App.tsx`, etc.) 100% clean and untouched.

```
                  ┌─────────────────────────────────────┐
                  │          AI Agent Sandbox           │
                  └──────────────────┬──────────────────┘
                                     │
                        POST /eval   │   node cli/debug/eval.js "..."
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      launch.ts (Debug Server)       │
                  └──────────┬──────────────────▲───────┘
                             │                  │
                1. Push SSE  │                  │  2. HTTP POST /respond
                (id, code)   │                  │  (id, result)
                             ▼                  │
                  ┌─────────────────────────────┴───────┐
                  │         Browser Webview             │
                  └─────────────────────────────────────┘
```

### Components List
* **`cli/debug/generate_debug_bridge.ts`** (Configuration task): Finds an available TCP port (starting from `9999`) and saves the port parameter to `.debug/config.json`. It does not generate a JavaScript file.
* **`cli/debug/debug_bridge_template.js`** (Browser Script Template): The JavaScript client template that runs inside the browser, intercepting logs and evaluating incoming commands.
* **`debug_bridge_plugin` in `vite.config.ts`** (Development Script Server & Injector): Injects `<script src="/debug_bridge.js">` non-intrusively via `transformIndexHtml` (head-prepend) during development (`apply: "serve"`), serves `/debug_bridge.js` dynamically from the client template with the selected port, and leaves production HTML completely untouched.
* **`cli/debug/launch.ts`** (Active Server): A long-running HTTP server that reads the port configuration from `.debug/config.json`, manages the SSE stream, bridges evaluation requests synchronously, and appends logs to local history files.
* **`cli/debug/eval.js`** (CLI Helper): A lightweight evaluation utility that allows developers or agents to synchronously execute code in the browser.
* **`src/app/index.html`** (Production HTML Entry): 100% clean of debug tooling. Zero intrusion into source code or production artifacts.
* **`.debug/`** (Ignored Data Directory): Contains the runtime configuration and persistent session log files:
  - `config.json`: The port configuration parameter for the debug bridge.
  - `logs.jsonl`: The browser console outputs and uncaught exceptions.
  - `history.jsonl`: The history of JS evaluations executed by the agent/developer.

---

## 2. Developer/Agent Usage Guide

### Step 1: Start the Debug Bridge Server
You can start the debug bridge components standalone using the following commands:

1. **Generate the client configuration**:
   ```bash
   npx tsx cli/debug/generate_debug_bridge.ts
   ```
   *Optional parameters:*
   - `--debug-port=<port>`: The starting port to probe for the debug server (default is `9999`).

2. **Start the debug server**:
   ```bash
   npx tsx cli/debug/launch.ts
   ```
   The server automatically binds to `0.0.0.0` (all network interfaces) to support both local and remote/LAN debugging out of the box.

### Step 2: Sending Commands / Querying Frontend State
The AI agent or developer can run expressions synchronously in the browser using the helper script:

```bash
node cli/debug/eval.js "document.title"
```

The script will block, wait for the browser to execute the code, and print the response directly to stdout:
```json
{
  "success": true,
  "result": "MeTuber - Home"
}
```

If the execution fails (e.g. invalid syntax or runtime error in the browser), `success` will be `false` and the error details will be returned in `result`:
```json
{
  "success": false,
  "result": "ReferenceError: nonExistentVar is not defined"
}
```

### Step 3: Inspecting Logs & History
- Read the JSON Lines file at **`/.debug/logs.jsonl`** to view console outputs, warnings, and uncaught exceptions captured from the browser console.
- Read the JSON Lines file at **`/.debug/history.jsonl`** to audit the chronological sequence of evaluation commands sent by the agent and their corresponding outcomes.

---

## 3. Git Hygiene
The runtime configuration and logs are ignored by git using the following `.gitignore` rule:
```gitignore
/.debug
```
Runtime data therefore does not pollute the commit history.
