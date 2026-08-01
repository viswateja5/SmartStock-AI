import { Card } from '../ui/Card';
import { BrainCircuit, Target, ShieldCheck, Database } from 'lucide-react';

interface KPIBannerProps {
  champion_model: string;
  metrics: { mape: number; rmse: number };
  metadata: { rows: number; columns: number };
}

export function KPIBanner({ champion_model, metrics, metadata }: KPIBannerProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Champion Model</p>
          <div className="p-2 bg-primary/10 text-primary rounded-lg"><BrainCircuit className="w-4 h-4" /></div>
        </div>
        <p className="text-2xl font-bold text-foreground capitalize truncate">{champion_model.replace('_', ' ')}</p>
      </Card>

      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Accuracy (MAPE)</p>
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><Target className="w-4 h-4" /></div>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{metrics.mape}%</p>
          <p className="text-xs text-muted-foreground mt-1">Historical Backtest Error</p>
        </div>
      </Card>

      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Confidence Score</p>
          <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><ShieldCheck className="w-4 h-4" /></div>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{metrics.mape < 15 ? 'High' : metrics.mape < 30 ? 'Medium' : 'Low'}</p>
          <p className="text-xs text-muted-foreground mt-1">Based on residual variance</p>
        </div>
      </Card>

      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Data Shape</p>
          <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg"><Database className="w-4 h-4" /></div>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{metadata.rows || 'N/A'}</p>
          <p className="text-xs text-muted-foreground mt-1">Total training rows</p>
        </div>
      </Card>
    </div>
  );
}
