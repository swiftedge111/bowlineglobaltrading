"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface TradingViewWidgetProps {
  /** Widget slug, e.g. "ticker-tape" or "market-overview" */
  script: string
  /** Widget configuration, serialized into the script tag */
  config: Record<string, unknown>
  className?: string
  /** Overrides for the loading placeholder */
  skeletonClassName?: string
  fallback?: ReactNode
}

/** TradingView can take ~10s on a cold cache; never hold the skeleton past this. */
const LOAD_TIMEOUT_MS = 25000

/**
 * Wrapper around TradingView's embed scripts.
 *
 * Their loader reads `document.currentScript.parentNode` at execution time, so
 * the script must still be attached to the DOM when it runs. React 19's strict
 * mode invokes effects twice — appending on the first pass and detaching in the
 * cleanup would leave an orphaned script that throws on `parentNode`. We mark
 * the container instead and let React tear down the subtree on real unmount.
 *
 * The skeleton is held until the injected iframe actually fires `load`, since
 * the embed script resolving says nothing about the widget having painted.
 */
export function TradingViewWidget({
  script,
  config,
  className,
  skeletonClassName,
  fallback,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  const hasFallback = fallback != null

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reveal = () => setStatus("ready")
    const timedOut = () => setStatus(hasFallback ? "unavailable" : "ready")
    const timer = window.setTimeout(timedOut, LOAD_TIMEOUT_MS)
    const onLoad = () => {
      window.clearTimeout(timer)
      reveal()
    }
    const onError = (event: Event) => {
      if (hasFallback && event.target instanceof HTMLScriptElement) {
        window.clearTimeout(timer)
        setStatus("unavailable")
      }
    }
    container.addEventListener("error", onError, true)

    // Inject once. This guard must not short-circuit the watchers below, or
    // strict mode's second pass would leave the widget stuck hidden.
    if (container.dataset.tvInjected !== "true") {
      container.dataset.tvInjected = "true"

      // TradingView injects its iframe into this inner node.
      const widget = document.createElement("div")
      widget.className = "tradingview-widget-container__widget"
      container.appendChild(widget)

      const el = document.createElement("script")
      el.src = `https://s3.tradingview.com/external-embedding/embed-widget-${script}.js`
      el.type = "text/javascript"
      el.async = true
      el.innerHTML = JSON.stringify(config)
      container.appendChild(el)
    }

    // The iframe is created asynchronously by TradingView's script.
    let watchedFrame: HTMLIFrameElement | null = null
    const watch = (iframe: HTMLIFrameElement) => {
      watchedFrame = iframe
      iframe.addEventListener("load", onLoad, { once: true })
    }

    const existing = container.querySelector("iframe")
    if (existing) watch(existing)

    const observer = new MutationObserver(() => {
      const iframe = container.querySelector("iframe")
      if (iframe) {
        watch(iframe)
        observer.disconnect()
      }
    })
    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      container.removeEventListener("error", onError, true)
      watchedFrame?.removeEventListener("load", onLoad)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, hasFallback])

  return (
    <div className={cn("relative", className)}>
      {status === "loading" && (
        <Skeleton
          className={cn("absolute inset-0 h-full w-full", skeletonClassName)}
        />
      )}
      <div
        ref={containerRef}
        className={cn(
          "tradingview-widget-container h-full w-full transition-opacity duration-500",
          status === "ready" ? "opacity-100" : "invisible opacity-0"
        )}
      />
      {status === "unavailable" && fallback}
    </div>
  )
}
