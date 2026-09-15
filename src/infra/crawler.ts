import { is_in_native } from "@/infra/device.client"
import { create_logger } from "./logger"

const logger = create_logger("SmartFetch")

export type NestedRecordValue<T> = NestedRecord<T> | T | NestedRecordValue<T>[]
export interface NestedRecord<T> {
    [key: string]: NestedRecordValue<T>
}

export function scan_record_object<T>(node: NestedRecordValue<T>, target_key?:string): NestedRecordValue<T>[]{
    const r: NestedRecordValue<T>[]  = []
    function visit(node: NestedRecordValue<T>){

        const node_record = node as Record<string, NestedRecordValue<T>>
        for (const key in node_record){

            const node_item = node_record[key]
            if (target_key && target_key === key){
                r.push(node_item)
            }

            if (typeof node_item === "object" && node_item !== null){
                visit(node_item)
            }
        }
    }
    visit(node)
    return r
}

export async function smart_fetch(input : string | URL | Request, init?: RequestInit, cors_proxy = ""){

    let url: string = ""
    let headers: Headers = new Headers()
    let request_method: string = "GET"
    if (typeof input === "string"){
        url = input
        headers = new Headers(init?.headers)
        request_method = init?.method || "GET"
    }
    else if(input instanceof URL){
        url = input.href
        headers = new Headers(init?.headers)
        request_method = init?.method || "GET"
    }
    else if (input instanceof Request){
        url = input.url
        headers = new Headers(input.headers)
        request_method = input.method
    }

    if (typeof navigator !== "undefined" && navigator.userAgent){
        if (cors_proxy && !headers.get("x-proxy-user-agent") && !headers.get("user-agent")){
            headers.set("x-proxy-user-agent", navigator.userAgent)
        }
        else if (is_in_native() && !cors_proxy && !headers.get("user-agent") && !headers.get("x-proxy-user-agent")){
            headers.set("user-agent", navigator.userAgent)
        }
    }

    let request_body: string | undefined = undefined
    if (init && init.body){
        if (typeof init.body === "string"){
            request_body = init.body
        }
        else {
            request_body = String(init.body)
        }
    }

    logger.debug("Executing smart_fetch", { url, method: request_method, is_native: is_in_native() && !cors_proxy })

    if (is_in_native() && !cors_proxy && window.__TAURI__?.core?.invoke){
        const native_headers: Record<string, string | number> = {}
        headers.forEach((v, k) => {
            const lower_k = k.toLowerCase()
            if (lower_k.startsWith("x-proxy-")){
                native_headers[k.slice(8)] = v
            }
            else {
                native_headers[k] = v
            }
        })

        const native_response = await window.__TAURI__.core.invoke("fetch", { req: { url: url, headers: native_headers, method: request_method, body: request_body } }) as {body:string, headers:HeadersInit, status:number}
        return new Response(native_response.body, {
            status: native_response.status,
            headers: native_response.headers
        })
    }
    else {
        const fetch_headers = new Headers()
        headers.forEach((v, k) => {
            const lower_k = k.toLowerCase()
            if (!cors_proxy && lower_k.startsWith("x-proxy-")){
                fetch_headers.set(k.slice(8), v)
            }
            else {
                fetch_headers.set(k, v)
            }
        })

        const fetch_init: RequestInit = {
            ...init,
            method: request_method,
            headers: fetch_headers,
            body: request_body,
        }

        if (typeof window !== "undefined"){
            fetch_init.credentials = "include"
        }
        return await fetch(`${cors_proxy}${url}`, fetch_init)
    }
}
