export function join_classes(...classes: (string | false | null | undefined)[]){
    return classes.filter(Boolean).join(" ")
}

export function schedule_animation_frame(callback: () => void): () => void{
    let frame_id: number | null = window.requestAnimationFrame(() => {
        frame_id = null
        callback()
    })

    return () => {
        if (frame_id === null){
            return
        }

        window.cancelAnimationFrame(frame_id)
        frame_id = null
    }
}

/**
 * Checks if a DOM element is currently hidden via display: none (directly or via an ancestor)
 * without triggering a forced layout/reflow by traversing the parent chain.
 */
export function is_element_hidden(element: HTMLElement | null): boolean{
    if (!element || !element.isConnected) return true
    let curr: HTMLElement | null = element
    while (curr){
        if (curr.style.display === "none"){
            return true
        }
        if (curr.classList.contains("hidden") || curr.hasAttribute("hidden")){
            return true
        }
        curr = curr.parentElement
    }
    return false
}
