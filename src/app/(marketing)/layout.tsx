import type { Viewport } from "next"

import styles from "@/app/bowline-theme.module.css"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

export const viewport: Viewport = { themeColor: "#ffffff" }

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className={`${styles.bowline} relative flex min-h-screen flex-col bg-secondary-50 text-secondary-900`}>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
