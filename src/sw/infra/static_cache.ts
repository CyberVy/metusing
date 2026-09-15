import { static_resource_cache_name, is_dev } from "@/infra/version"
import { CacheStorageMap } from "@/infra/storage/cache.client"
import { update } from "@/infra/version"

const static_resource_cache = new CacheStorageMap(static_resource_cache_name)

export function handle_fetch_for_static_resource(event: FetchEvent): void{
    if (is_dev) return

    const url = new URL(event.request.url)
    if (url.pathname === "/"){
        event.waitUntil(update(static_resource_cache))
    }

    const fetch_and_cache = async () => {
        const cached = await static_resource_cache.get(event.request) || await static_resource_cache.get(event.request.url)
        if (cached){
            return cached
        }
        const response = await fetch(event.request)
        if (response.status === 200){
            await static_resource_cache.set(event.request, response.clone())
        }
        return response
    }

    event.respondWith(fetch_and_cache())
}
