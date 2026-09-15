/// <reference lib="webworker" />

import { router } from "@/sw/infra/router"
import { handle_fetch_for_static_resource } from "@/sw/infra/static_cache"

const sw = self as unknown as ServiceWorkerGlobalScope

// Local Static Web Assets
router.intercept((_request, url) => {
    if (url.hostname !== location.hostname) return false
    if (url.href === location.href) return false
    return ["/"].some(prefix => url.pathname.startsWith(prefix))
}, handle_fetch_for_static_resource)

router.listen()

sw.addEventListener('install', () => sw.skipWaiting())
sw.addEventListener('activate', event => event.waitUntil(sw.clients.claim()))
