import Image from "next/image"

import { company } from "@/lib/site"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  showWordmark?: boolean
  invert?: boolean
}

export function Logo({
  className,
  showWordmark = true,
  invert = false,
}: LogoProps) {
  const [light, dark] = showWordmark
    ? ["/brand/bowline-logo.svg", "/brand/bowline-logo-reversed.svg"]
    : ["/logo-mark.svg", "/brand/bowline-mark-reversed.svg"]

  return (
    <Image
      src={invert ? dark : light}
      alt={company.name}
      width={showWordmark ? 1786 : 512}
      height={showWordmark ? 491 : 512}
      unoptimized
      loading={invert ? "lazy" : "eager"}
      className={cn(
        showWordmark ? "h-auto w-40 max-w-full sm:w-48" : "size-9",
        className
      )}
    />
  )
}
