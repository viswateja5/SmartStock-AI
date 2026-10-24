import { Card } from '../ui/Card';
import { Layers } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from 'recharts';

interface SHAPAnalysisProps {
  featureData: Array<{ feature: string; importance: number }>;
}

export function SHAPAnalysis({ featureData }: SHAPAnalysisProps) {
  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[470px] flex flex-col justify-between">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg text-foreground">SHAP Feature Attribution</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Mean absolute SHAP contribution (|φ|) across chronological validation samples.
        </p>
      </div>

      <div className="w-full h-[320px]">
        {featureData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No feature importance data available for this model type.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={featureData} margin={{ top: 0, right: 30, left: 70, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis 
                type="number" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                dataKey="feature" 
                type="category" 
                stroke="var(--muted-foreground)" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                width={70}
              />
              <RechartsTooltip 
                cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                contentStyle={{ 
                  backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }}
                formatter={(val: any) => [`${typeof val === 'number' ? val.toFixed(4) : val} impact`, 'Mean |SHAP|']}
              />
              <Bar dataKey="importance" fill="#8b5cf6" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {featureData.map((_, i) => (
                  <Cell key={i} fill={i < 3 ? '#8b5cf6' : '#6366f1'} opacity={1 - (i * 0.07)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground border-t border-border/50 pt-2.5 flex items-center justify-between">
        <span>Higher values indicate greater influence on sales predictions.</span>
        <span className="font-mono text-primary">Leak-Free Attribution</span>
      </div>
    </Card>
  );
}
