import * as React from "react"
import { cn } from "../../lib/utils"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, glass = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border text-card-foreground shadow-sm bg-card",
          glass && "backdrop-blur-md bg-card/80",
          className
        )}
        {...props}
      >
        <div className="relative z-10 h-full">{children as React.ReactNode}</div>
      </div>
    )
  }
)
Card.displayName = "Card"

const KPICard = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn("p-6 flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-md", className)}
      {...props}
    >
      {children as React.ReactNode}
    </Card>
  )
)
KPICard.displayName = "KPICard"

export { Card, KPICard }
