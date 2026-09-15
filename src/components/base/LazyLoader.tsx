import { useState, useEffect, useRef, ReactNode, RefObject, useCallback } from 'react'
import type { FC, ComponentPropsWithRef } from "react"
import { is_element_hidden } from "@/components/utils"

export type KeepLoadedMargin = {
    top?: number
    bottom?: number
    left?: number
    right?: number
}

export type LazyContainerProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
    children: ReactNode
    // The placeholder element should have the same dimensions as the children to avoid layout shifts (CLS).
    // These dimensions must be set in advance before the initial layout occurs.
    initial_placeholder?: ReactNode
    threshold?: number | number[]
    rootMargin?: string
    // Accepts a DOM Element, a React Ref object, or null (defaults to browser viewport)
    root?: Element | RefObject<Element | null> | null
    keep_loaded_margin?: KeepLoadedMargin
}

const LazyContainer: FC<LazyContainerProps> = ({
    children,
    initial_placeholder = <div style={{ minHeight: '200px' }}>Loading...</div>,
    threshold = 0,
    rootMargin = '200px', // A larger margin is recommended for smoother scrolling
    root = null,
    keep_loaded_margin,
    className,
    ref,
    ...props
}) => {
    const {
        top: keep_loaded_top,
        bottom: keep_loaded_bottom,
        left: keep_loaded_left,
        right: keep_loaded_right,
    } = keep_loaded_margin || {}

    // Track visibility of the element in the viewport
    const [is_visible, set_is_visible] = useState<boolean>(false)
    // Track if the element has been rendered at least once
    const [has_loaded_once, set_has_loaded_once] = useState<boolean>(false)
    // Store the exact dimensions before the element unmounts
    const [dimensions, set_dimensions] = useState<{ width: number; height: number } | null>(null)
  
    // Use a ref to access the latest loaded state inside the observer callback
    const hasLoaded_ref = useRef<boolean>(false)

    const element_ref = useRef<HTMLDivElement>(null)
    const set_element_ref = useCallback((element: HTMLDivElement | null) => {
        element_ref.current = element

        if (typeof ref === "function"){
            ref(element)
            return
        }

        if (ref){
            ref.current = element
        }
    }, [ref])

    useEffect(() => {
    // Resolve the root element whether passed as a DOM node or a React ref object
        const rootElement = root && typeof root === 'object' && 'current' in root
            ? root.current
            : (root as Element | null)

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries

                if (entry.isIntersecting){
                    // The element enters the viewport
                    set_is_visible(true)
                    set_has_loaded_once(true)
                    hasLoaded_ref.current = true
                }
                else {
                    // The element leaves the viewport
                    if (hasLoaded_ref.current && element_ref.current){
                        // If the element (or its parent) has display: none, skip unmounting to prevent layout collapse.
                        // We use the optimized, reflow-free is_element_hidden implementation here.
                        if (is_element_hidden(element_ref.current)){
                            return
                        }
                        const rect = entry.boundingClientRect

                        let should_keep_loaded = false

                        if (
                            keep_loaded_top !== undefined ||
                            keep_loaded_bottom !== undefined ||
                            keep_loaded_left !== undefined ||
                            keep_loaded_right !== undefined
                        ){
                            let element_absolute_top = 0
                            let element_absolute_bottom = 0
                            let element_absolute_left = 0
                            let element_absolute_right = 0
                            let scroll_content_height = 0
                            let scroll_content_width = 0

                            if (rootElement){
                                const rootRect = rootElement.getBoundingClientRect()
                                element_absolute_top = rect.top - rootRect.top + rootElement.scrollTop
                                element_absolute_bottom = rect.bottom - rootRect.top + rootElement.scrollTop
                                element_absolute_left = rect.left - rootRect.left + rootElement.scrollLeft
                                element_absolute_right = rect.right - rootRect.left + rootElement.scrollLeft
                                scroll_content_height = rootElement.scrollHeight
                                scroll_content_width = rootElement.scrollWidth
                            }
                            else {
                                element_absolute_top = rect.top + window.scrollY
                                element_absolute_bottom = rect.bottom + window.scrollY
                                element_absolute_left = rect.left + window.scrollX
                                element_absolute_right = rect.right + window.scrollX
                                scroll_content_height = document.documentElement.scrollHeight
                                scroll_content_width = document.documentElement.scrollWidth
                            }

                            const distance_from_top = element_absolute_top
                            const distance_from_bottom = scroll_content_height - element_absolute_bottom
                            const distance_from_left = element_absolute_left
                            const distance_from_right = scroll_content_width - element_absolute_right

                            if (keep_loaded_top !== undefined && distance_from_top <= keep_loaded_top){
                                should_keep_loaded = true
                            }
                            if (keep_loaded_bottom !== undefined && distance_from_bottom <= keep_loaded_bottom){
                                should_keep_loaded = true
                            }
                            if (keep_loaded_left !== undefined && distance_from_left <= keep_loaded_left){
                                should_keep_loaded = true
                            }
                            if (keep_loaded_right !== undefined && distance_from_right <= keep_loaded_right){
                                should_keep_loaded = true
                            }
                        }

                        if (should_keep_loaded){
                            return
                        }

                        const width = rect.width
                        const height = rect.height

                        // Capture the actual rendered dimensions just before hiding the content
                        set_dimensions({
                            width,
                            height,
                        })
                        // Unmount the real children to save memory
                        set_is_visible(false)
                    }
                }
            },
            {
                root: rootElement,
                rootMargin,
                threshold,
            }
        )

        const currentRef = element_ref.current
        if (currentRef){
            observer.observe(currentRef)
        }

        return () => {
            if (currentRef){
                observer.unobserve(currentRef)
            }
        }
    }, [
        threshold,
        rootMargin,
        root,
        keep_loaded_top,
        keep_loaded_bottom,
        keep_loaded_left,
        keep_loaded_right
    ])

    // If the element is out of the viewport but was loaded before, 
    // lock its container size to prevent scrollbar layout shifts.
    const container_style: React.CSSProperties = (!is_visible && has_loaded_once && dimensions)
        ? { 
            width: `${dimensions.width}px`, 
            height: `${dimensions.height}px`,
            overflow: 'hidden' 
        }
        : {}

    return (
        <div
            {...props}
            ref={set_element_ref} 
            style={container_style}
            className={className}
        >
            {is_visible ? (
            // 1. In viewport: render the actual content
                children 
            ) : has_loaded_once ? (
            // 2. Left viewport: render nothing, layout is preserved by containerStyle
                null 
            ) : (
            // 3. Initial state: render the user-provided placeholder
                initial_placeholder 
            )}
        </div>
    )
}

export { LazyContainer }
