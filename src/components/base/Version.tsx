"use client"

import version, { update, static_resource_cache_name } from "@/infra/version"
import { string_icons } from "@/components/ui_constants"
import { useState } from "react"
import { vibrate } from "@/infra/device.client"
import type { ReactNode } from "react"
import type { ComponentPropsWithRef } from "react"
import { CacheStorageMap } from "@/infra"

type VersionProps = Omit<ComponentPropsWithRef<"div">, "children">

const Version = function Version({ className = "", ref, ...props }: VersionProps){
    const [clear_cache_icon, set_cache_icon] = useState<ReactNode>(string_icons.reset)

    return (
        <div
            {...props}
            ref={ref}
            className={className}
        >
            <span className={"text-xs"}>
                v{version}
            </span>
            <button
                type="button"
                className={"ml-1 text-xs hover:cursor-pointer text-green-600 dark:text-green-300 rounded-md"}
                onClick={() => {
                    vibrate()
                    set_cache_icon(string_icons.success)
                    update(new CacheStorageMap(static_resource_cache_name))
                        .then(() => setTimeout(() => set_cache_icon(string_icons.reset), 2000))
                }}
            >
                {clear_cache_icon}
            </button>
            <p className="text-xs">{`Built at: ${import.meta.env.VITE_BUILD_TIME}`}</p>
        </div>
    )
}

Version.displayName = "Version"

export { Version }
