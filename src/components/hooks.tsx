import type { RefObject } from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { BaseController, BaseKeyedController } from "@/infra"
import { is_ios_device } from "@/infra/device.client"
import { create_logger } from "@/infra/logger"
import { is_element_hidden } from "./utils"

const logger = create_logger("Hooks")

export interface UseControllerOptions<State, Selected = State>{
    events: string | string[]
    selector?: (state: State) => Selected
    server_snapshot?: Selected | (() => Selected)
}

export function useController<State, Selected = State>(
    controller: BaseController<State, any>,
    options: UseControllerOptions<State, Selected>
): Selected{
    const { events, selector, server_snapshot } = options
    const event_keys = Array.isArray(events) ? events : [events]
    const events_key = event_keys.slice().sort().join(",")

    const subscribe = useCallback((on_store_change: () => void) => {
        const handler = () => on_store_change()
        for (const evt of event_keys){
            controller.addEventListener(evt, handler)
        }
        return () => {
            for (const evt of event_keys){
                controller.removeEventListener(evt, handler)
            }
        }
    }, [controller, events_key])

    const get_snapshot = useCallback(() => {
        const st = controller.state
        return selector ? selector(st) : (st as unknown as Selected)
    }, [controller, selector])

    const get_server_snapshot = useCallback(() => {
        if (server_snapshot !== undefined){
            return typeof server_snapshot === "function"
                ? (server_snapshot as () => Selected)()
                : server_snapshot
        }
        const st = controller.state
        return selector ? selector(st) : (st as unknown as Selected)
    }, [controller, selector, server_snapshot])

    return useSyncExternalStore(subscribe, get_snapshot, get_server_snapshot)
}

export function useKeyedController<Key extends string | number, Value>(
    controller: BaseKeyedController<Key, any, any>,
    key: Key,
    default_value: Value
): Value{
    const key_events = useMemo(() => controller.get_key_events(key), [controller, key])
    const events_key = key_events.slice().sort().join(",")

    const subscribe = useCallback((on_store_change: () => void) => {
        const handler = () => on_store_change()
        for (const evt of key_events){
            controller.addEventListener(evt, handler)
        }
        return () => {
            for (const evt of key_events){
                controller.removeEventListener(evt, handler)
            }
        }
    }, [controller, events_key])

    const get_snapshot = useCallback(() => {
        return controller.get_value(key, default_value)
    }, [controller, key, default_value])

    const get_server_snapshot = useCallback(() => {
        return default_value
    }, [default_value])

    return useSyncExternalStore(subscribe, get_snapshot, get_server_snapshot)
}
 
export function useMediaQuery(query: string, initial_value = false): boolean{
    const subscribe = useCallback((callback: () => void) => {
        if (typeof window === "undefined") return () => {}
        const media = window.matchMedia(query)
        media.addEventListener("change", callback)
        return () => media.removeEventListener("change", callback)
    }, [query])

    const get_snapshot = useCallback(() => {
        if (typeof window === "undefined") return initial_value
        return window.matchMedia(query).matches
    }, [query, initial_value])

    const get_server_snapshot = useCallback(() => initial_value, [initial_value])

    return useSyncExternalStore(subscribe, get_snapshot, get_server_snapshot)
}

/** root_margin: expands or shrinks the viewport area used by IntersectionObserver.
 *
 *  protected_padding: keep the contents which are within the top or bottom 'protected_padding' in view to prevent repeating renders
**/
type UseInViewportOptions = {
    enabled?: boolean
    root?: HTMLElement | RefObject<HTMLElement | null> | null
    root_margin?: number | string
    protected_padding?: number
    threshold?: number | number[]
    initial_in_view?: boolean
}

function get_root_margin(root_margin: number | string){
    if (typeof root_margin === "number") return `${root_margin}px`

    return root_margin
}

export function useInViewport<T extends HTMLElement>({
    enabled = true,
    root,
    root_margin = 0,
    protected_padding = 0,
    threshold = 0,
    initial_in_view = false,
}: UseInViewportOptions = {}){
    const [element, set_element] = useState<T | null>(null)
    const [is_intersecting, set_is_intersecting] = useState(initial_in_view)
    const ref = useCallback((next_element: T | null) => {
        set_element(next_element)
    }, [])

    useEffect(() => {
        if (!element) return

        const resolved_root = (root && typeof root === "object" && "current" in root ? root.current : root) || null

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const target_element = entry.target as T
                if (is_element_hidden(target_element)){
                    set_is_intersecting(false)
                    return
                }

                const root_element = resolved_root || document.documentElement
                if (protected_padding){
                    if (target_element.offsetTop - root_element.offsetTop <= protected_padding || target_element.offsetTop - root_element.offsetTop >= root_element.scrollHeight - protected_padding){
                        set_is_intersecting(true)
                        return
                    }
                }

                set_is_intersecting(entry.isIntersecting)
            })
        }, { threshold: threshold, rootMargin: get_root_margin(root_margin), root: resolved_root })
        observer.observe(element)

        return () => observer.disconnect()
    }, [element, protected_padding, root, root_margin, threshold])

    const in_view = enabled && is_intersecting

    return { ref: ref, in_view: in_view }
}

// create an auto sync state and ref object
export function useAutoSyncRefAndState<T>(value: T): [RefObject<T>, (value: T | ((prev: T) => T)) => void, T]{
    const [state, set_state] = useState(value)
    const state_ref = useRef(value)
    const dispatch_func = (value: T | ((prev: T) => T)) => {
        if (typeof value !== "function"){
            set_state(value)
            state_ref.current = value
        }
        else {
            const f = value as (prev: T) => T
            const r = f(state_ref.current)
            set_state(r)
            state_ref.current = r
        }
    }
    return [state_ref, dispatch_func, state]
}

// beta feature
// 1. screen rotation in iOS Safari (PWA and Webkit) may cause a crash when the document height is large
// 2. provide a better rotation animation
export function useOptimizedRotation(){
    const [hidden, set_hidden] = useState(false)

    useEffect(() => {
        if (is_ios_device()){

            const height = document.documentElement.clientHeight
            const width = document.documentElement.clientWidth
            let is_portrait = height > width

            const resize_callback = () => {
                const height_after_resize = document.documentElement.clientHeight
                const width_after_resize = document.documentElement.clientWidth
                const is_portrait_after_resize = height_after_resize > width_after_resize

                // not a rotation action
                if (is_portrait == is_portrait_after_resize)
                    return

                // a rotation action is detected, update the is_portrait state
                is_portrait = !is_portrait
                set_hidden(true)
                setTimeout(() => set_hidden(false), 200)
            }
            window.addEventListener("resize", resize_callback)
            return () => window.removeEventListener("resize", resize_callback)
        }
    }, [])

    return hidden
}

export interface PersistedParams<T> {
    initial_value: T
    on_load?: () => Promise<T | undefined> | T | undefined
    on_save?: (value: T) => Promise<void> | void
}

export function usePersistedState<T>({ initial_value, on_load, on_save }: PersistedParams<T>): [T, (value: T | ((prev: T) => T)) => void]{
    const [state, set_state] = useState<T>(initial_value)
    const is_initialized = useRef(false)
    const user_has_set_state = useRef(false)

    const set_state_wrapped = useCallback((value: T | ((prev: T) => T)) => {
        user_has_set_state.current = true
        is_initialized.current = true
        set_state(value)
    }, [])

    useEffect(() => {
        let active = true
        if (!on_load){
            is_initialized.current = true
            return
        }

        is_initialized.current = false
        user_has_set_state.current = false

        const load_value = async () => {
            try {
                const loaded_val = await on_load()
                if (!active) return
                if (!user_has_set_state.current && loaded_val !== undefined){
                    set_state(loaded_val)
                }
            }
            catch (err){
                logger.error("Failed to load persisted state", err)
            }
            finally {
                if (active){
                    is_initialized.current = true
                }
            }
        }
        load_value()

        return () => {
            active = false
        }
    }, [on_load])

    useEffect(() => {
        if (!is_initialized.current || !on_save) return
        try {
            const res = on_save(state)
            if (res && typeof res.catch === "function"){
                res.catch(err => logger.error("Failed to save persisted state", err))
            }
        }
        catch (err){
            logger.error("Failed to save persisted state", err)
        }
    }, [state, on_save])

    return [state, set_state_wrapped]
}

export function usePersistedRefAndState<T>({ initial_value, on_load, on_save } : PersistedParams<T>): [RefObject<T>, (value: T | ((prev: T) => T)) => void, T]{
    const [state, set_state] = useState<T>(initial_value)
    const state_ref = useRef<T>(initial_value)
    const is_initialized = useRef(false)
    const user_has_set_state = useRef(false)

    const dispatch_func = useCallback((value: T | ((prev: T) => T)) => {
        user_has_set_state.current = true
        is_initialized.current = true
        let next_val: T
        if (typeof value !== "function"){
            next_val = value
        }
        else {
            const f = value as (prev: T) => T
            next_val = f(state_ref.current)
        }
        set_state(next_val)
        state_ref.current = next_val
    }, [])

    useEffect(() => {
        let active = true
        if (!on_load){
            is_initialized.current = true
            return
        }

        is_initialized.current = false
        user_has_set_state.current = false

        const load_value = async () => {
            try {
                const loaded_val = await on_load()
                if (!active) return
                if (!user_has_set_state.current && loaded_val !== undefined){
                    set_state(loaded_val)
                    state_ref.current = loaded_val
                }
            }
            catch (err){
                logger.error("Failed to load persisted state", err)
            }
            finally {
                if (active){
                    is_initialized.current = true
                }
            }
        }
        load_value()

        return () => {
            active = false
        }
    }, [on_load])

    useEffect(() => {
        if (!is_initialized.current || !on_save) return
        try {
            const res = on_save(state)
            if (res && typeof res.catch === "function"){
                res.catch(err => logger.error("Failed to save persisted state", err))
            }
        }
        catch (err){
            logger.error("Failed to save persisted state", err)
        }
    }, [state, on_save])

    return [state_ref, dispatch_func, state]
}
