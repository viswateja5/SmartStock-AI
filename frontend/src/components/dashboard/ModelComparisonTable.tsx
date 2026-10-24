import { Card } from '../ui/Card';
import { SlidersHorizontal, Clock, Trophy } from 'lucide-react';

interface ModelComparisonTableProps {
  models: Array<{ 
    model: string; 
    mape: number; 
    wape?: number; 
    rmse: number; 
    mae?: number;
    training_time: number;
  }>;
}

export function ModelComparisonTable({ models }: ModelComparisonTableProps) {
  return (
    <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Model Leaderboard</h3>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
          Ranked by WAPE / RMSE
        </span>
      </div>

      <div className="space-y-3.5">
        {models.slice(0, 6).map((m, i) => (
          <div key={m.model} className="flex flex-col gap-1.5 border-b border-border/50 pb-3 last:border-0 last:pb-0">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm capitalize flex items-center gap-2 text-foreground">
                {i === 0 ? (
                  <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    {m.model.replace('_', ' ')}
                  </span>
                ) : (
                  <span>{m.model.replace('_', ' ')}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-muted-foreground/70"/> {m.training_time}s
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>
                WAPE: <span className="font-semibold text-foreground">{m.wape !== undefined ? `${m.wape.toFixed(1)}%` : `${m.mape.toFixed(1)}%`}</span>
              </span>
              <span>
                MAPE: <span className="text-foreground">{m.mape.toFixed(1)}%</span>
              </span>
              <span>
                RMSE: <span className="text-foreground">{m.rmse.toFixed(1)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
