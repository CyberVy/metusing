"use client"

import { useEffect, useState } from "react"
import { get_image_url_with_fallback, is_ios_device } from "@/infra"
import { ContextMenu } from "@/components/composite/ContextMenuContainer"

import type { CoverImageOptions } from "@/infra"
import type { ContextMenuProps } from "@/components/composite/ContextMenuContainer"
import type { ComponentPropsWithRef } from "react"

export type ImageProps = Omit<ComponentPropsWithRef<"img">, "children" | "src"> & {
    src?: string
    image_proxy_api?: string
    context_menu?: Omit<ContextMenuProps, "children" | "disabled" | "on_click_trigger">
    generated_cover_options?: CoverImageOptions
}

function Image({
    src,
    image_proxy_api,
    context_menu,
    generated_cover_options,
    alt = "",
    className,
    ref,
    ...props
}: ImageProps){
    const [is_ios, set_is_ios] = useState(false)
    const requested_src = src ? `${image_proxy_api || ""}${src}` : undefined
    const resolved_src = get_image_url_with_fallback(requested_src, alt, generated_cover_options)

    useEffect(() => {
        set_is_ios(is_ios_device())
    }, [])

    const image = (
        <img
            {...props}
            ref={ref}
            src={resolved_src}
            alt={alt}
            className={[
                "[-webkit-touch-callout:none]",
                is_ios ? "[-webkit-user-drag:none]" : "",
                className,
            ].filter(Boolean).join(" ")}
        />
    )

    if (!context_menu){
        return image
    }

    return (
        <ContextMenu {...context_menu}>
            {image}
        </ContextMenu>
    )
}

export { Image }
