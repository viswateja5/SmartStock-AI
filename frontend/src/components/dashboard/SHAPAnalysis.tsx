import { Card } from '../ui/Card';
import { Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

interface SHAPAnalysisProps {
  featureData: any[];
}

export function SHAPAnalysis({ featureData }: SHAPAnalysisProps) {
  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[450px] flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        <Layers className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-lg">SHAP Feature Importance</h3>
      </div>
      <div className="w-full h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={featureData} margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" opacity={0.5} />
            <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis dataKey="feature" type="category" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <RechartsTooltip 
              cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
              contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}
              formatter={(val: any) => val.toFixed(4)}
            />
            <Bar dataKey="importance" fill="#8b5cf6" radius={[0, 4, 4, 0]} animationDuration={1500}>
              {featureData.map((_, i) => (
                 <Cell key={i} fill={i < 3 ? '#8b5cf6' : 'var(--primary)'} opacity={1 - (i * 0.08)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
