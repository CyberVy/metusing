/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

interface ImportMetaEnv {
    readonly VITE_BUILD_TIME: string
    readonly VITE_NATIVE_ENTRY_URL: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
