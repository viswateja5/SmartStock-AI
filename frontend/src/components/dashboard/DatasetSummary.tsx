import { Card } from '../ui/Card';
import { Database, CalendarDays, ShieldAlert } from 'lucide-react';

interface DatasetSummaryProps {
  metadata: {
    rows?: number;
    columns?: number;
    missing_values?: number;
    duplicate_records?: number;
    date_range?: string[];
    features_used?: number;
    excluded_leakage_columns?: string[];
  };
}

export function DatasetSummary({ metadata }: DatasetSummaryProps) {
  return (
    <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground">Dataset Profile</h3>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Total Rows</span>
          <span className="font-medium font-mono text-foreground">{metadata.rows?.toLocaleString() || 'N/A'}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Raw Features</span>
          <span className="font-medium font-mono text-foreground">{metadata.columns || 0}</span>
        </div>
        {metadata.features_used !== undefined && (
          <div className="flex justify-between py-1 border-b border-border/50">
            <span className="text-muted-foreground">Engineered Features</span>
            <span className="font-medium font-mono text-foreground">{metadata.features_used}</span>
          </div>
        )}
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Missing Values</span>
          <span className={`font-mono font-medium ${(metadata.missing_values || 0) > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
            {metadata.missing_values || 0}
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-border/50">
          <span className="text-muted-foreground">Duplicates</span>
          <span className="font-medium font-mono text-foreground">{metadata.duplicate_records || 0}</span>
        </div>
        {metadata.date_range && metadata.date_range.length === 2 && (
          <div className="flex flex-col py-1.5 border-b border-border/50 gap-1">
            <span className="text-muted-foreground text-xs flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/70"/> Timeline
            </span>
            <span className="font-mono text-xs text-foreground">{metadata.date_range[0]} → {metadata.date_range[1]}</span>
          </div>
        )}
        {metadata.excluded_leakage_columns && metadata.excluded_leakage_columns.length > 0 && (
          <div className="flex flex-col py-1.5 gap-1.5 pt-2">
            <span className="text-muted-foreground text-xs flex items-center gap-1 text-rose-500 font-medium">
              <ShieldAlert className="w-3.5 h-3.5"/> Excluded Leakage Columns
            </span>
            <div className="flex flex-wrap gap-1">
              {metadata.excluded_leakage_columns.map(c => (
                <span key={c} className="text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1.5 py-0.5 rounded font-mono">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
