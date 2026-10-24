import React from "react"
import { FolderOpen } from "lucide-react"

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export function EmptyState({ 
  title = "No Data Available", 
  description = "There is currently no data to display for this selection.",
  icon = <FolderOpen className="w-10 h-10 text-muted-foreground/50" />
}: EmptyStateProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-6 bg-muted/10 rounded-2xl border border-dashed border-border"
    >
      <div className="mb-4 p-4 bg-muted/20 rounded-full">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[250px]">{description}</p>
    </div>
  )
}
