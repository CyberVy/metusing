## Project Structure

- `src/app/`: Application UI entry points and shells.
  - `index.html`: SPA HTML shell entry.
  - `main.tsx`: SPA entry mount point.
  - `App.tsx`: main application root component.
  - `native_entry/`:
    - `index.html`: native/Tauri HTML shell entry.
    - `main.tsx`: native/Tauri entry mount point.
    - `App.tsx`: native/Tauri entry route component.
  - `globals.css`: global styles, font imports, and Tailwind setup.
- `src/blocks/`: business-facing React UI blocks composed from base components.
  - Put app-specific composite UI here and bind it directly to domain controllers.
- `src/components/`: base reusable UI components and UI infrastructure.
  - Put framework-level or reusable domain-agnostic primitives here.
  - Commonly categorized into `base/` (atomic UI), `composite/` (generic composite components), and `animation/` (transitions/animations).
- `src/core/`: domain logic, algorithms, data generators, and application state coordination.
  - `controllers/`: centralized reactive state and data controllers.
- `src/infra/`: infrastructure, platform adapters, Web IPC client, and utilities.
  - `*.client.ts`: browser/webview-only client integrations.
  - `web_ipc.client.ts`: frontend-side Tauri IPC adapter.
- `src/inject/`: client-side scripts injected directly into external WebViews.
  - Organized into `infra/` (environment/IPC polyfills) and `core/` (business/product logic injections), each using `index.ts` as the entry point.
- `src/sw/`: service worker source (built/packaged to `public/sw.js`).
  - `core/`: core service worker logic (e.g., image/video cache, playlist handlers).
  - `infra/`: service worker infrastructure/adapters (e.g., static resource cache).
  - `main.worker.ts`: entry worker script.
- `public/`: static assets, icons, `manifest.json`, and built SW entry.
- `scripts/`: local scripts.
- `cli/`: local CLI helper utilities.
  - [debug/](cli/debug): frontend debug bridge utility (SSE & HTTP server) for host-to-browser agent communication.
- `draft/`: temporary sandboxes and development draft files.
- `src-tauri/`: Tauri (Rust) backend and native app configuration.
  - `src/main.rs`: desktop/mobile app entry point.
  - `src/lib.rs`: shared Tauri command/runtime wiring.
  - `src/commands/`: backend IPC commands exposed to the web frontend.
  - `src/webview/` and `src/window/`: controllers for Tauri WebView and native window management.
  - `src/logging.rs`: application logger setup.
  - `Cargo.toml` and `Cargo.lock`: Rust package manifest and lockfile.
  - `build.rs`: Tauri/Rust build script.
  - `tauri.conf.json`, `tauri.ios.conf.json`, `tauri.macos.conf.json`: platform configs.
  - `capabilities/`: Tauri capability allowlists.
  - `icons/`: app icons for desktop/mobile targets.
  - `gen/`: generated native project artifacts.
  - `target/`: Rust build outputs (generated).

## Data Architecture (Event-Driven Producer-Consumer)

The application adheres to a strict **Event-Driven Producer-Consumer Architecture** separated into three distinct tiers:

```
┌────────────────────────────────────────────────────────┐
│               Data Generator (No Events)               │
│  - Stateless asynchronous/synchronous data producers   │
│  - API clients, parsers, transformers & algorithms     │
└───────────────────────────┬────────────────────────────┘
                            │ Raw data / Domain entities
                            ▼
┌────────────────────────────────────────────────────────┐
│               Data Controller (With Events)            │
│  - Single source of truth (SSOT) & state orchestrator  │
│  - Caching, deduplication, persistence & lifecycles    │
│  - Framework-agnostic state & event dispatch           │
└───────────────────────────┬────────────────────────────┘
                            │ Reactive snapshots & events
                            ▼
┌────────────────────────────────────────────────────────┐
│             Data Consumer (UIs, Tests, Adapters)       │
│  - Reactive UI bindings (`useSyncExternalStore`)       │
│  - Test runners, debug bridges & CLI utilities         │
│  - External IPC handlers & platform adapters           │
└────────────────────────────────────────────────────────┘
```

### 1. Data Generator (No Events)
- **Definition**: Stateless data-producing modules responsible for fetching raw inputs, parsing, algorithmic transformation, and low-level data extraction. Data Generator is an architectural role rather than a directory boundary; generator modules may live under `src/core/` or `src/infra/`.
- **Constraints**:
  - **No Application Events**: Must NOT publish application or domain state-change events, maintain external subscription registries, or couple with reactive view lifecycles. Low-level event-based APIs may be used internally.
  - **No Owned Application State**: Must return results through values or Promises and must not own long-lived application state, domain caches, or persistence lifecycles. External I/O may be nondeterministic.

### 2. Data Controller (With Events)
- **Definition**: Centralized domain state coordinators and reactive event dispatchers (located under `src/core/controllers/`).
- **Responsibilities**:
  - Serves as the **Single Source of Truth (SSOT)** for domain state.
  - Coordinates Data Generators, performs caching, indexing, deduplication, and persistence.
  - Exposes framework-agnostic, read-only state snapshots and dispatches granular domain events via `EventTarget` when internal state mutates.
  - Must remain independent of React and other UI frameworks; consumer-side adapters are responsible for translating controller state and events into framework-specific reactive contracts.
- **Constraints**:
  - Controllers own mutation logic and state lifetimes; all state transitions must occur through explicit controller methods.

### 3. Data Consumer (UIs, Tests, External Adapters)
- **Definition**: Observers and consumers that react to controller state changes or invoke controller commands.
- **Roles**:
  - **UI Blocks & Components**: React rendering must consume Controller snapshots through `useSyncExternalStore`-based hooks. Tests, debug tools, IPC adapters, and other non-React consumers may observe Controller events directly.
  - **Tests & Debug Bridges**: Automated verification scripts and CLI evaluators querying snapshots or observing dispatched events.
  - **Platform & IPC Adapters**: External message handlers dispatching payloads directly into controller actions.
- **Constraints**:
  - **Unidirectional Flow & Anti-Bypass**: Consumers must NEVER bypass a Data Controller to interact directly with a Data Generator when a Controller exists for that domain.
  - **No Manual Domain-State Sync**: UI consumers must not mirror controller-owned domain state into component state through effects. Ephemeral UI state that is not owned by a Controller remains local to the component.
  - **Zero Cross-Block Callback Drilling**: Do NOT forward domain action callbacks through intermediate UI blocks. An immediate parent-child callback is permitted when the parent handles it directly rather than forwarding it further.
  - **Minimal Block Props**: Props for domain blocks (`src/blocks/`) must NEVER duplicate, proxy, or shadow state and action logic that can be directly managed or derived by a domain Controller. Reserve props only for instance-specific context (e.g., item records in list renderers, slot composition) or local configuration that the Controller does not own.

## Storage Architecture (Normalized Index-Data Separation)

The client-side persistence layer (`LocalForage` / IndexedDB) adheres to a strict **Index-Data Separation and Normalized Storage Pattern**:

```
┌────────────────────────────────────────────────────────┐
│                   Index / Order Store                  │
│  - Dedicated sequence and index registries ('orders')  │
│  - Key: <collection_key> -> Value: string[] (ID list)  │
└───────────────────────────┬────────────────────────────┘
                            │ Sequence of Entity IDs
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Entity Data Stores                   │
│  - Pure, strongly-typed domain records & caches        │
│  - Key: <entity_id> -> Value: TEntity                  │
└───────────────────────────┬────────────────────────────┘
                            │ Batched hydration
                            ▼
┌────────────────────────────────────────────────────────┐
│               Data Controller & Snapshot               │
│  - Assembles hydrated view entities into memory        │
│  - Dispatches tearing-free reactive snapshots to UI    │
└────────────────────────────────────────────────────────┘
```

### 1. Pure Entity Stores (No Magic/Index Keys)
- **Primary Key Constraint**: Every entity store must use the entity's unique identifier (`id` or `<entity>_id`) as its key, and store exclusively pure entity records (`TEntity`).
- **Zero Key Pollution**: Entity stores must NEVER mix metadata, index arrays, or magic keys (e.g., `"order"`) into the entity key-space.
- **Single Type Integrity**: Store instances must be strongly typed without union types (e.g., `LocalForageMap<TRecord>`, strictly avoiding `LocalForageMap<TRecord | string[]>`).

### 2. Dedicated Index & Sequence Stores
- **Index Isolation**: Display sequences, custom orderings, and bounded ID queues must be isolated in dedicated index stores (e.g., `"orders"` store).
- **Zero Write Amplification**: Persistent reordering, front-promotion, and re-indexing operations mutate only the index store (`string[]`), while Controllers update their in-memory state as needed. These operations must not rewrite unchanged entity records.

### 3. Separation of Domain Entity vs User State
- **Entity Purity**: Base domain entities must strictly represent objective, stateless domain metadata.
- **Relational / Event Data**: User interactions, access logs, and custom associations must be decoupled into distinct relational records or dedicated domain controllers rather than injected directly into base entity models.

### 4. Normalized Hydration Flow
- **Hydration Responsibility**: Controllers read ordered ID lists from index stores, batch-hydrate entities from corresponding entity caches, and replace snapshot references when state changes. Consumers must treat returned snapshots as immutable.

## Naming Conventions

- Types, interfaces, classes, enums, and type aliases: `PascalCase` (e.g. `PlayerState`).
- React components: `PascalCase` filenames and exports (e.g. `GlobalSettingButton`).
- React component props types: component name plus `Props` in `PascalCase` (e.g. `PlayerProps`).
- Blocks: `PascalCase` filenames and exports under `src/blocks/`.
- React hooks: `camelCase` names starting with `use` (e.g. `useWindowSize`).
- Functions and methods: `snake_case` (e.g. `get_playlist_id_from_url`).
- Variables, parameters, refs, and state values: `snake_case` (e.g. `current_video_id`).
- Constants: `SCREAMING_SNAKE_CASE` for module-level semantic constants (e.g. `DESKTOP_USER_AGENT`); use `snake_case` for local values and function bindings.
- Type imports: use `import type` when importing only types.
- Path aliases: prefer `@/` for imports under `src/`.
- WebView injection scripts: entry point is `src-tauri/src/inject.ts` (source) and `src-tauri/src/inject.js` (compiled output). Sub-modules under `src/inject/` may use `*.inject.ts` naming.
- Type Definitions: Follow the proximity principle (define types close to where they are used). Avoid creating separate type files (like `types.ts` or `*.types.ts`) unless the type declarations are highly complex or repeatedly reused across multiple files.
- Descriptive Naming: All variable, function, component, and file names must clearly reflect their purpose and responsibility. Use readable, self-explanatory names and strictly avoid generic, vague, or obscure names (e.g. prefer `is_sidebar_open` over `temp` or `flag`).
- External Naming: Preserve names required by external APIs, framework contracts, serialized payloads, and implemented or overridden interfaces.

## UI & Dialog Rules

- **Emoji Prohibition (Enforced by Oxlint)**: Do not use emojis in any UI text or icons.
- **Color Restrictions (AI Only)**: AI-authored UI changes may use only black, white, gray, and their alpha variants. Do not introduce chromatic colors or alter existing human-authored colors unless explicitly requested.
- **Icons & SVGs**: Write SVG components in the corresponding `icons.tsx` based on the UI ownership layer (e.g., `src/components/icons.tsx` for generic component-level icons and `src/blocks/icons.tsx` for block-level business icons). Inline SVGs outside these files are prohibited by Oxlint. Do not import external icon libraries.
- **Modals & Dialogs**:
  - Do not use native window dialogs (`window.alert`, `window.confirm`, `window.prompt`). This is enforced by Oxlint.
  - Use [ModalContainer.tsx](src/components/composite/ModalContainer.tsx) to build modals and dialog components.
  - If a modal requires animations, compose it with [AnimationContainer.tsx](src/components/animation/AnimationContainer.tsx).

## Layering Rules

- **UI vs Non-UI Directories**: React UI components, UI-specific React hooks, and JSX rendered by the main application may exist only in `src/app/`, `src/blocks/`, and `src/components/`. All other directories under `src/` (such as `src/core/`, `src/infra/`, `src/inject/`, and `src/sw/`) are Non-UI environments.
- **Non-UI Isolation**: Non-UI environments must NEVER import modules from `src/app/`, `src/blocks/`, or `src/components/`.
- **Component Isolation**: `src/components/` must NEVER import from `src/app/`, `src/blocks/`, or `src/core/`. Keep business UI and domain dependencies out of reusable components.
- **Infrastructure Isolation**: `src/infra/` must NEVER import from `src/core/`.
- The import restrictions above apply to runtime imports, type-only imports, dynamic imports, and re-exports, and are enforced by Oxlint.
- **Web IPC Communications**:
  - All communication between frontend web app and backend Rust must utilize the Web IPC layer (e.g., [web_ipc.client.ts](src/infra/web_ipc.client.ts)).
  - Shared data types used across the IPC boundary should follow the general type rules and be defined close to their usage/IPC client implementation.

## Base Rules

- **Minimalist & Clean Code**: Keep edits minimal, direct, and targeted. Avoid sweeping reformatting, unnecessary fallback mechanisms, and defensive over-engineering. Prioritize human readability and simplicity.
- **Refactor Before Feature**: Review whether existing mechanisms can support a new design before extending them. Stop and seek developer approval before changing a foundational abstraction, public cross-module interface, persistence model, or architectural ownership boundary. Ordinary local refactoring does not require separate approval.
- **Style Consistency**: Match existing naming, formatting, and import styles in every file.
- **Interface Reuse & Dependencies**: When importing from outside a module, prefer its public `index.ts` exports. Within the same module, use direct relative imports when they are clearer and avoid cycles. Reuse existing types and interfaces when suitable. Do not add dependencies or design complex public interfaces without developer approval.
- **Local Verification**: After editing TypeScript or TSX files, run `npm run check`. Also run the relevant build or Cargo verification when modifying build configuration, generated entry sources, IPC boundaries, or Rust code.

## AI Debugging & Communication (Frontend Debug Bridge)

When running the development server via `npm run dev`, a debug bridge is automatically launched via [launch.ts](cli/debug/launch.ts) that allows direct, silent bidirectional communication with the browser/Tauri webview context. Before starting the dev server, check if the dev server is already running to avoid duplicate/repeated runs.
- **Frontend Logs**: Read [logs.jsonl](.debug/logs.jsonl) (in JSON Lines format) to inspect console output and errors in real-time.
- **Execute Commands**: Synchronously execute JavaScript code in the browser/Tauri webview context using [eval.js](cli/debug/eval.js):
  ```bash
  node cli/debug/eval.js "document.title"
  ```
  This will print the response directly to stdout, for example:
  ```json
  {
    "success": true,
    "result": "Hello!"
  }
  ```
- **Execution History**: The history of executed commands and their results is stored in [history.jsonl](.debug/history.jsonl).
- **Sub-Agent Delegation**: When implementing features or fixing bugs that affect frontend runtime behavior, prefer delegating validation and log monitoring to a sub-agent. The sub-agent should actively use the Frontend Debug Bridge to execute tests, verify UI correctness, and tail [logs.jsonl](.debug/logs.jsonl) to ensure no regressions or runtime console errors are introduced.
