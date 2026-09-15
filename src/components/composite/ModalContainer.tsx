"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { is_in_browser } from "@/infra/device.client"
import { ScrollToBottomButton, ScrollToTopButton } from "@/components/composite/FixedScrollButtons"

import type { ComponentPropsWithRef } from "react"

type FullscreenModalContainerProps = ComponentPropsWithRef<"div"> & {
    enable_scroll_button?: boolean
}

function FullscreenModalContainer({ className = "", children, enable_scroll_button = false, ref, ...props }: FullscreenModalContainerProps){

    const [in_browser, set_in_browser] = useState(true)
    const container_ref = useRef<HTMLDivElement | null>(null)

    const set_container_ref = useCallback((node: HTMLDivElement | null) => {
        container_ref.current = node
        if (typeof ref === "function"){
            ref(node)
            return
        }
        if (ref){
            ref.current = node
        }
    }, [ref])

    useEffect(() => {
        set_in_browser(is_in_browser())
    }, [])

    return (
        <div
            ref={set_container_ref}
            className={[
                "fixed left-0 top-0 w-screen overflow-auto no-scrollbar overscroll-none",
                "h-screen",
                // Keep 100vh as baseline in iOS containers without browser chrome (e.g. standalone/PWA).
                // The issue is timing of dynamic viewport-related layout metrics (not dvh itself): values like offsetTop can settle later.
                // Any CSS that depends on browser UI chrome, such as dvh or inset, can trigger the same delay.
                in_browser ? "supports-[height:100dvh]:h-dvh" : "",
                "pt-[env(safe-area-inset-top)]",
                className
            ].filter(Boolean).join(" ")}
            {...props}
        >
            {children}
            {enable_scroll_button &&
                <>
                    <ScrollToTopButton
                        className="bottom-4 right-4"
                        element_ref={container_ref}
                    />
                    <ScrollToBottomButton
                        className="bottom-4 right-17"
                        element_ref={container_ref}
                    />
                </>}
        </div>
    )
}

export { FullscreenModalContainer }


type FloatingModalContainerProps = ComponentPropsWithRef<"div">

function FloatingModalContainer({ className = "", children, ref, ...props }: FloatingModalContainerProps){
    return (
        <div
            ref={ref}
            className={[
                "fixed",
                "h-[20vh] w-[80vw]",
                "rounded-[30px] border border-black/8 bg-white/78 p-1 text-black/88 shadow-[0_18px_48px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.42)] backdrop-blur-2xl",
                "dark:border-white/10 dark:bg-[#111111]/78 dark:text-white/88 dark:shadow-[0_20px_52px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.03)]",
                className
            ].filter(Boolean).join(" ")}
            {...props}
        >
            <div className={[
                "overflow-auto overscroll-none no-scrollbar h-full w-full rounded-[30px] border border-black/8 bg-black/2.5 p-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.46)]",
                "dark:border-white/10 dark:bg-white/[0.035] dark:text-white/88 dark:shadow-[0_14px_32px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)]"
            ].filter(Boolean).join(" ")}
            >
                {children}
            </div>
        </div>
    )
}

export { FloatingModalContainer }
