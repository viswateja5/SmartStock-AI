import { Card } from '../ui/Card';
import { BrainCircuit, Target, ShieldCheck, Database } from 'lucide-react';

interface KPIBannerProps {
  champion_model: string;
  metrics: { 
    mape: number; 
    rmse: number; 
    wape?: number; 
    mae?: number; 
    r2?: number; 
  };
  metadata: { 
    rows: number; 
    columns: number; 
    features_used?: number;
    excluded_leakage_columns?: string[];
  };
  confidence?: {
    score: number;
    level: string;
    factors?: any;
  };
}

export function KPIBanner({ champion_model, metrics, metadata, confidence }: KPIBannerProps) {
  // Determine confidence display
  const confLevel = confidence?.level || (metrics.wape ? (metrics.wape < 15 ? 'High' : metrics.wape < 30 ? 'Medium' : 'Low') : (metrics.mape < 15 ? 'High' : metrics.mape < 30 ? 'Medium' : 'Low'));
  const confScore = confidence?.score;

  const confColor = 
    confLevel === 'High' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
    confLevel === 'Medium' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
    'text-rose-500 bg-rose-500/10 border-rose-500/20';

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* 1. Champion Model */}
      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Champion Model</p>
          <div className="p-2 bg-primary/10 text-primary rounded-lg"><BrainCircuit className="w-4 h-4" /></div>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground capitalize truncate">{champion_model.replace('_', ' ')}</p>
          <p className="text-xs text-muted-foreground mt-1">Best out-of-sample backtest</p>
        </div>
      </Card>

      {/* 2. Error Metrics (WAPE / MAPE) */}
      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Forecast Error</p>
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><Target className="w-4 h-4" /></div>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {metrics.wape !== undefined ? `${metrics.wape.toFixed(1)}%` : `${metrics.mape.toFixed(1)}%`}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {metrics.wape !== undefined ? 'WAPE' : 'MAPE'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            MAPE: {metrics.mape?.toFixed(1)}% · RMSE: {metrics.rmse?.toFixed(1)}
          </p>
        </div>
      </Card>

      {/* 3. Multi-Factor Confidence Score */}
      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confidence Score</p>
          <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><ShieldCheck className="w-4 h-4" /></div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{confLevel}</span>
            {confScore !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confColor}`}>
                {confScore}/100
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Multi-factor reliability rating
          </p>
        </div>
      </Card>

      {/* 4. Data Volume & Features */}
      <Card className="p-6 bg-card/40 backdrop-blur-3xl border border-border/50 shadow-sm relative overflow-hidden flex flex-col justify-between hover:bg-card/60 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data & Features</p>
          <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg"><Database className="w-4 h-4" /></div>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{metadata.rows?.toLocaleString() || 'N/A'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {metadata.features_used !== undefined ? `${metadata.features_used} active features` : `${metadata.columns || 0} columns`} (leak-free)
          </p>
        </div>
      </Card>
    </div>
  );
}
