export const is_dev = process.env.NODE_ENV === "development"
import { version as package_version } from "../../package.json"
import type { CacheStorageMap } from "./storage/cache.client"
import { create_logger } from "./logger"

const logger = create_logger("VersionUpdate")
const version = `${package_version}${is_dev ? "dev" : ""}`
export default version
export const static_resource_cache_name = "static-resource-cache"
export async function update(static_resource_cache: CacheStorageMap){

    const latest_index_html_response = await fetch("/", { cache: "no-store" })
    if (!latest_index_html_response.ok) return

    const latest_index_html_text = await latest_index_html_response.clone().text()

    const keys = await static_resource_cache.keys()
    if (!keys) return

    for (const key of keys){
        const url = new URL(key.url)
        if (url.pathname === "/"){
            const cached_index_html_response = await static_resource_cache.get(key)
            if (!cached_index_html_response) break

            const cached_index_html_text = await cached_index_html_response.text()
            if (latest_index_html_text !== cached_index_html_text){
                const latest_relative_links = get_relative_links_from_html_string(latest_index_html_text)
                const cached_relative_links: string[] = []
                for (const k of keys){
                    cached_relative_links.push(new URL(k.url).pathname + new URL(k.url).search)
                }

                // 1. Silent update: fetch and cache all missing new static assets first
                const fetch_promises = latest_relative_links
                    .filter((link) => !cached_relative_links.includes(link))
                    .map((link) => {
                        return fetch(link).then(async (link_response) => {
                            if (link_response.ok || link_response.type === "opaque"){
                                await static_resource_cache.set(new URL(link, location.origin), link_response)
                                logger.info("Updated static asset", { link })
                            }
                            else {
                                logger.warn("Skipped caching failed response for asset", { link, status: link_response.status })
                            }
                        }).catch((err) => {
                            logger.error("Failed to update asset", { link, error: err })
                        })
                    })

                await Promise.all(fetch_promises)

                // 2. Atomically update index.html only after all new assets are cached
                await static_resource_cache.delete(key)
                await static_resource_cache.set(key, latest_index_html_response)
                logger.info("Updated root index.html")

                // 3. Delete legacy assets after delay
                setTimeout(() => {
                    cached_relative_links.forEach(async(link, index) => {
                        if (!latest_relative_links.includes(link)){
                            // do not check "/" here because it has already been checked
                            if (link === "/" || link.startsWith("/?")) return
                            
                            static_resource_cache.delete(keys[index]).then(r => {
                                if (r) return
                                return static_resource_cache.delete(keys[index].url)
                            }).then(() => logger.info("Deleted legacy asset", { link }))
                        }
                    })
                }, 5000)
            }
        }
    }
}

export function is_later_version(v1:string, v2:string){
    const [maj_1_str, min_1_str, patch_1_str] = v1.split('.')
    const [maj_2_str, min_2_str, patch_2_str] = v2.split('.')

    const maj_1 = parseInt(maj_1_str)
    const min_1 = parseInt(min_1_str)
    const patch_1 = parseInt(patch_1_str)
    const maj_2 = parseInt(maj_2_str)
    const min_2 = parseInt(min_2_str)
    const patch_2 = parseInt(patch_2_str)

    if (maj_1 > maj_2){
        return true
    }
    else if (maj_1 < maj_2){
        return false
    }
    if (min_1 > min_2){
        return true
    }
    else if (min_1 < min_2){
        return false
    }
    return patch_1 > patch_2
}

export function get_relative_links_from_html_string(html: string){

    let matches = [...html.matchAll(/"(\/(?!>).+?)"/g)].map(m => m[1])
    matches =  matches.map(v => {
        if (v.endsWith("\\")){
            v = v.slice(0, -1)
        }
        return v
    })
    return [...new Set(matches)]
}
