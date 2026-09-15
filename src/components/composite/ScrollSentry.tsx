"use client"

import React, { useEffect, useMemo } from "react"
import { useInViewport } from "@/components/hooks"

export type ScrollSentryProps = {
    on_trigger: () => void
    throttle_ms?: number
    root_margin?: string | number
    enabled?: boolean
}

function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): T{
    let in_throttle = false
    return function(this: any, ...args: any[]){
        if (!in_throttle){
            fn.apply(this, args)
            in_throttle = true
            setTimeout(() => in_throttle = false, limit)
        }
    } as any
}

const ScrollSentry = React.memo(function ScrollSentry({
    on_trigger,
    throttle_ms = 500,
    root_margin = 0,
    enabled = true,
}: ScrollSentryProps){
    const { ref, in_view } = useInViewport<HTMLDivElement>({ enabled, root_margin })

    const throttled_callback = useMemo(() => {
        return throttle(on_trigger, throttle_ms)
    }, [on_trigger, throttle_ms])

    useEffect(() => {
        if (in_view && enabled){
            throttled_callback()
        }
    }, [in_view, enabled, throttled_callback])

    return <div ref={ref} className="h-[0.5px] w-full pointer-events-none" />
})

ScrollSentry.displayName = "ScrollSentry"

export { ScrollSentry }
