import { useState } from 'react';
import { Card } from '../ui/Card';
import { BarChart3 } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, BarChart, Bar, ReferenceLine } from 'recharts';

interface ResidualAnalysisProps {
  scatterData: any[];
  histogramData: any[];
  qqData: any[];
  mean: number;
  std: number;
}

export function ResidualAnalysis({ scatterData, histogramData, qqData, mean, std }: ResidualAnalysisProps) {
  const [activeTab, setActiveTab] = useState<'scatter' | 'histogram' | 'qq'>('scatter');

  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[450px] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Residual Analysis</h3>
        </div>
        
        <div className="flex bg-muted/50 p-1 rounded-xl">
          <button onClick={() => setActiveTab('scatter')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'scatter' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Scatter</button>
          <button onClick={() => setActiveTab('histogram')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'histogram' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Histogram</button>
          <button onClick={() => setActiveTab('qq')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'qq' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Q-Q Plot</button>
        </div>
      </div>
      
      <div className="w-full h-[300px] relative">
        {activeTab === 'scatter' && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis type="number" dataKey="actual" name="Actual" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="number" dataKey="residual" name="Residual" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }} />
              <ReferenceLine y={0} stroke="var(--primary)" strokeDasharray="3 3" />
              <Scatter data={scatterData} fill="#10b981" animationDuration={1000}>
                {scatterData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={Math.abs(entry.residual) > (std * 1.5) ? '#ef4444' : '#10b981'} fillOpacity={0.6} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'histogram' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="bin_center" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <RechartsTooltip cursor={{ fill: 'var(--muted)', opacity: 0.2 }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'qq' && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis type="number" dataKey="theoretical" name="Theoretical Quantiles" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="number" dataKey="sample" name="Sample Quantiles" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }} />
              <ReferenceLine y={0} stroke="var(--primary)" strokeDasharray="3 3" />
              <Scatter data={qqData} fill="#8b5cf6" fillOpacity={0.6} animationDuration={1000} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground border-t border-border/50 pt-4">
        <span>Mean: <span className="font-mono text-foreground">{mean.toFixed(2)}</span></span>
        <span>Std Dev: <span className="font-mono text-foreground">{std.toFixed(2)}</span></span>
      </div>
    </Card>
  );
}
