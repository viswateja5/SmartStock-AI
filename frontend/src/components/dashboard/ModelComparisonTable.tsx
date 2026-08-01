import { Card } from '../ui/Card';
import { SlidersHorizontal, Clock } from 'lucide-react';

interface ModelComparisonTableProps {
  models: Array<{ model: string; mape: number; rmse: number; training_time: number }>;
}

export function ModelComparisonTable({ models }: ModelComparisonTableProps) {
  return (
    <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Model Leaderboard</h3>
      </div>
      <div className="space-y-4">
        {models.slice(0, 5).map((m, i) => (
          <div key={m.model} className="flex flex-col gap-1 border-b border-border/50 pb-3 last:border-0 last:pb-0">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm capitalize flex items-center gap-2">
                {i === 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>}
                {m.model.replace('_', ' ')}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3"/> {m.training_time}s
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>MAPE: <span className="font-mono text-foreground">{m.mape.toFixed(1)}%</span></span>
              <span>RMSE: <span className="font-mono text-foreground">{m.rmse.toFixed(1)}</span></span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
