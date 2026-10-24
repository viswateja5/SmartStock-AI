import { useState } from 'react';
import { Card } from '../ui/Card';
import { BarChart3 } from 'lucide-react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, 
  BarChart, Bar, ReferenceLine 
} from 'recharts';

interface ResidualAnalysisProps {
  scatterData: Array<{ actual: number; predicted: number; residual: number }>;
  histogramData: Array<{ bin_center: number; count: number }>;
  qqData: Array<{ theoretical: number; sample: number }>;
  mean: number;
  std: number;
}

export function ResidualAnalysis({ scatterData, histogramData, qqData, mean, std }: ResidualAnalysisProps) {
  const [activeTab, setActiveTab] = useState<'scatter' | 'histogram' | 'qq'>('scatter');

  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[470px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg text-foreground">Residual Diagnostics</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Statistical out-of-sample error distribution (Actual − Predicted).
          </p>
        </div>
        
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40">
          <button 
            onClick={() => setActiveTab('scatter')} 
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'scatter' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Residuals vs Fitted
          </button>
          <button 
            onClick={() => setActiveTab('histogram')} 
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'histogram' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Histogram
          </button>
          <button 
            onClick={() => setActiveTab('qq')} 
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'qq' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Q-Q Plot
          </button>
        </div>
      </div>
      
      <div className="w-full h-[310px] relative">
        {/* TAB 1: Residuals vs Fitted / Predicted */}
        {activeTab === 'scatter' && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis 
                type="number" 
                dataKey="predicted" 
                name="Fitted / Predicted" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                label={{ value: 'Fitted (Predicted) Demand', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis 
                type="number" 
                dataKey="residual" 
                name="Residual" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                label={{ value: 'Residual (y − ŷ)', angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <RechartsTooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                contentStyle={{ 
                  backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }} 
                formatter={(val: any, name: any) => [typeof val === 'number' ? val.toFixed(2) : val, name]}
              />
              <ReferenceLine y={0} stroke="var(--primary)" strokeDasharray="4 4" strokeWidth={1.5} />
              <Scatter data={scatterData} fill="#10b981" isAnimationActive={false}>
                {scatterData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={Math.abs(entry.residual) > (std * 1.5) ? '#ef4444' : '#10b981'} 
                    fillOpacity={0.65} 
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}

        {/* TAB 2: Residual Histogram */}
        {activeTab === 'histogram' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis 
                dataKey="bin_center" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                label={{ value: 'Residual Bin Center', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false} 
                label={{ value: 'Frequency', angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <RechartsTooltip 
                cursor={{ fill: 'var(--muted)', opacity: 0.2 }} 
                contentStyle={{ 
                  backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }} 
              />
              <ReferenceLine x={0} stroke="var(--primary)" strokeDasharray="3 3" />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* TAB 3: Q-Q Plot */}
        {activeTab === 'qq' && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis 
                type="number" 
                dataKey="theoretical" 
                name="Theoretical Quantiles" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                label={{ value: 'Theoretical Normal Quantiles', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis 
                type="number" 
                dataKey="sample" 
                name="Sample Quantiles" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                label={{ value: 'Sample Quantiles', angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <RechartsTooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                contentStyle={{ 
                  backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }} 
                formatter={(val: any, name: any) => [typeof val === 'number' ? val.toFixed(2) : val, name]}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="2 2" />
              <Scatter data={qqData} fill="#8b5cf6" fillOpacity={0.65} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Residual Summary Statistics */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground border-t border-border/50 pt-3">
        <div className="flex gap-4">
          <span>Mean Bias: <span className="font-mono font-medium text-foreground">{mean.toFixed(3)}</span></span>
          <span>Residual Std (σ): <span className="font-mono font-medium text-foreground">{std.toFixed(3)}</span></span>
        </div>
        <span className="text-[11px] text-muted-foreground italic">
          Zero-centered residuals indicate unbiased forecasting
        </span>
      </div>
    </Card>
  );
}
