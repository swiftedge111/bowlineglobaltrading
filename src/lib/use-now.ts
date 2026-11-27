"use client"

import { useEffect, useState } from "react"

/** The current time, refreshed on an interval so countdowns stay current. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** `"5h 12m"`, or null once the moment has passed. */
export function countdown(target: string, now: number): string | null {
  const ms = new Date(target).getTime() - now
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return minutes > 0 ? `${minutes}m` : "under a minute"
}
