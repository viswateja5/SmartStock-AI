import React from "react"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`bg-muted/40 animate-pulse rounded-xl ${className}`}
      {...props}
    />
  )
}
