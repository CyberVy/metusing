"use client"

import { useState } from "react"
import { NaiveButton } from "@/components/base/Buttons"
import { vibrate } from "@/infra/device.client"
import { highlight, string_icons } from "@/components/ui_constants"

import type { ComponentPropsWithRef, ReactNode, Ref } from "react"

export type ListToButtonsProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
    list: string[]
    on_select?: (item: string | null) => void
}

type StringArrayProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
    // String array rendered as list rows.
    array: string[]
    // Optional className applied to the inner li elements.
    list_class_name?: string
    // Optional title shown above the rows.
    title?: ReactNode
    // Renders an ordered list when enabled.
    ordered?: boolean
    // Optional empty placeholder shown when the array is empty.
    empty_text?: ReactNode
}

function StringArray(
    {
        array,
        list_class_name = "",
        title,
        ordered = false,
        empty_text = "No items",
        className = "",
        ref,
        ...props
    }: StringArrayProps){
    const list_children = (
        <>
            {array.length === 0 &&
                <li className="list-none rounded-[22px] bg-black/2.5 px-3.5 py-3 text-[14px] text-black/48 dark:bg-white/[0.035] dark:text-white/48">
                    {empty_text}
                </li>}

            {array.map((text, index) => {
                return (
                    <li
                        key={`${text}-${index}`}
                        className={[
                            "list-none rounded-[22px] border border-transparent bg-black/2.5 px-3.5 py-3 text-[15px] font-medium leading-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition duration-300 ease-in-out",
                            "dark:bg-white/[0.035] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                            list_class_name,
                        ].filter(Boolean).join(" ")}
                    >
                        {text}
                    </li>
                )
            })}
        </>
    )

    return (
        <div
            ref={ref}
            className={[
                "rounded-[28px] border border-black/8 bg-white/78 p-2.5 text-black/88 shadow-[0_18px_48px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.42)] backdrop-blur-2xl",
                "dark:border-white/10 dark:bg-[#111111]/78 dark:text-white/88 dark:shadow-[0_20px_52px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.03)]",
                className,
            ].filter(Boolean).join(" ")}
            {...props}
        >
            {title &&
                <div className="px-3.5 pb-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/42 dark:text-white/42">
                    {title}
                </div>}

            {ordered &&
                <ol className="flex flex-col gap-1">
                    {list_children}
                </ol>}

            {!ordered &&
                <ul className="flex flex-col gap-1">
                    {list_children}
                </ul>}
        </div>
    )
}

export type { StringArrayProps }
export { StringArray }

function ListToButtons({ list, on_select, className = "", ref, ...props }: ListToButtonsProps){

    const [selected_item, set_selected_item] = useState<string | number | null>(null)
    const [is_collapsed, set_is_collapsed] = useState(true)
    const item_base_style = "px-2 py-1  rounded-xl border border-black/20 dark:border-white/20 hover:bg-black/30 dark:hover:bg-white/30 transition duration-300 ease-in-out"

    return (
        <div
            {...props}
            ref={ref}
            className={["select-none", className].filter(Boolean).join(" ")}
        >
            <NaiveButton
                className="w-27 h-9 border border-black/10 dark:border-white/10 rounded-2xl"
                on_click={() => {
                    set_is_collapsed(!is_collapsed)
                }}
            >
                <span className={`${selected_item ? highlight : ""} text-2xl`}>
                    {string_icons.menu} {is_collapsed ? string_icons.down_triangle : string_icons.up_triangle} {list.length}
                </span>
            </NaiveButton>

            {<div className={`flex flex-wrap text-xs gap-1 py-2 pl-2 pr-2 max-h-25 overflow-auto ${is_collapsed ? 'hidden' : 'block'}`}>
                {list.map((item, index) => (
                    <button
                        type="button"
                        key={index}
                        className={item === selected_item ? `${highlight} ${item_base_style}` : item_base_style}
                        onClick={() => {
                            vibrate()
                            set_selected_item(item === selected_item ? null : item)
                            on_select?.(item === selected_item ? null : item)
                        }}
                    >
                        {item}
                    </button>
                ))}
            </div>}
        </div>
    )
}


export { ListToButtons }
