# nextkit

**Nextkit** is a modern, cross-platform application framework designed with the philosophy that "The Web is the Application." It allows you to build a single codebase using web technologies and deploy it as a high-performance Web App, a Progressive Web App (PWA), and a Native Desktop/Mobile application.

## Features

- **True Cross-Platform**: Write once, deploy everywhere—Web, PWA, and Native (Windows, macOS, Linux, iOS, and Android).
- **Web-First Philosophy**: Leverages the power of modern web standards to provide a seamless experience across all platforms.
- **Vite + React 19**: Powered by React 19 and Vite for instant HMR and high-performance builds.
- **Native Performance**: Uses **Tauri 2.0** to provide native system access and small binary sizes with a Rust-based backend.
- **PWA Ready**: Includes a built-in Service Worker architecture for offline capabilities and installation.

## Tech Stack

- **Frontend**: [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- **Native Bridge**: [Tauri](https://tauri.app/) (Rust)
- **Service Worker**: [esbuild](https://esbuild.github.io/) for SW bundling
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/), [Rust](https://www.rust-lang.org/)

## Quick Start / Create New App

Scaffold a new project using the interactive wizard (zero configuration required):

```bash
# Using npm
npm create nextkit

# Or using npx / pnpm / bun
npx create-nextkit
pnpm create nextkit
bun create nextkit
```

When working inside this repository, you can run the interactive wizard directly:

```bash
npm run create
# Or specify directory directly:
npm run create -- ../my-app
```

## Getting Started (Developing Nextkit)

### Prerequisites
#### Web
- [Node.js](https://nodejs.org/) (v20 or later)
#### Native (Optional)
- [Rust](https://www.rust-lang.org/)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
- [Tauri CLI](https://crates.io/crates/tauri-cli)
```bash
cargo install tauri-cli
```
- [Other System Dependencies](https://tauri.app/start/prerequisites/)

### Installation

```bash
npm install
```

## Development Commands

Development scripts are managed via `package.json`.

| Command               | Description                                                                   |
|:----------------------|:------------------------------------------------------------------------------|
| `npm run create`      | Launches the interactive project creation wizard.                             |
| `npm run dev`         | Starts the Vite dev server (port 4000), Service Worker watcher, and Debug Bridge. |
| `npm run build`       | Builds the static export of the site and minifies the Service Worker.         |
| `npm run start`       | Serves the production build locally (from the `dist` directory).              |
| `npm run check`       | Runs Oxlint and TypeScript compiler check concurrently.                       |
| `npm run tauri <cmd>` | Executes Tauri commands (e.g., `npm run tauri dev` or `npm run tauri build`). |

### Running Native App

To start the native application in development mode:
```bash
npm run tauri dev
```

To build the native application for production:
```bash
npm run tauri build
```

To start the native mobile application in development mode:
```bash
npm run tauri ios dev
npm run tauri android dev
```

To build the native mobile application for production:
```bash
npm run tauri ios build
npm run tauri android build
```

## Project Structure

- `src/app/`: Application UI entry points, HTML shells, and root App components.
- `src/blocks/`: Business-facing React UI blocks composed from base components.
- `src/components/`: Base reusable React components and UI infrastructure.
- `src/core/`: Core domain logic and app-specific pure logic.
- `src/infra/`: Infrastructure, platform adapters, shared types, and utility libraries.
- `src/sw/`: Service Worker source code.
- `src-tauri/`: Rust backend and native configuration.
- `public/`: Static assets, including icons and the bundled `sw.js`.

## Learn More

- [Vite Documentation](https://vite.dev/guide/) - Next generation frontend tooling.
- [React Documentation](https://react.dev/) - The library for web and native user interfaces.
- [Tauri Documentation](https://tauri.app/learn/) - Framework for building tiny, fast binaries for desktop and mobile.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
