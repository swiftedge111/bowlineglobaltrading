import type { Metadata } from "next"

import { SettingsScreen } from "@/components/settings/settings-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Settings",
  description: "Sign in to manage your Bowline profile, password, and active sessions.",
  path: "/settings",
  robots: { index: false, follow: false },
})

export default function SettingsPage() {
  return <SettingsScreen />
}
