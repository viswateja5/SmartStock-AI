import { Card } from '../ui/Card';
import { Database, CalendarDays } from 'lucide-react';

interface DatasetSummaryProps {
  metadata: {
    rows?: number;
    columns?: number;
    missing_values?: number;
    duplicate_records?: number;
    date_range?: string[];
  };
}

export function DatasetSummary({ metadata }: DatasetSummaryProps) {
  return (
    <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Dataset Summary</h3>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Rows</span>
          <span className="font-medium">{metadata.rows}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Features</span>
          <span className="font-medium">{metadata.columns}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Missing Values</span>
          <span className="font-medium text-amber-500">{metadata.missing_values}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Duplicates</span>
          <span className="font-medium">{metadata.duplicate_records}</span>
        </div>
        {metadata.date_range && metadata.date_range.length === 2 && (
          <div className="flex flex-col py-1 border-b border-border/50 gap-1 mt-2">
            <span className="text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3"/> Time Range</span>
            <span className="font-mono text-xs">{metadata.date_range[0]} to {metadata.date_range[1]}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
