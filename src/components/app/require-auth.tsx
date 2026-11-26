"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/components/providers/auth-provider"
import { Logo } from "@/components/logo"

/** Keeps protected UI hidden until the session and required role are known. The API enforces authorization independently. */
export function RequireAuth({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode
  adminOnly?: boolean
}) {
  const { status, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const allowed = status === "authed" && (!adminOnly || user?.role === "ADMIN")

  useEffect(() => {
    if (status === "loading") return

    if (status === "guest") {
      // Remember where they were headed so sign-in can return them there.
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }

    if (adminOnly && user?.role !== "ADMIN") {
      router.replace("/dashboard")
    }
  }, [status, user?.role, adminOnly, pathname, router])

  if (!allowed) return <AuthPending />

  return <>{children}</>
}

/**
 * Shown while the session is being restored, and for the instant between
 * deciding to redirect and the route actually changing.
 */
function AuthPending() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white">
      <Logo showWordmark={false} className="animate-pulse" />
      <p className="text-sm text-secondary-500">Checking your session…</p>
    </div>
  )
}
