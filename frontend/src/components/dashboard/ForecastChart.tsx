import { Card } from '../ui/Card';
import { TrendingUp } from 'lucide-react';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ComposedChart, Brush } from 'recharts';

interface ForecastChartProps {
  data: any[];
}

export function ForecastChart({ data }: ForecastChartProps) {
  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[550px]">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-lg">Forecast Trajectory & 95% Confidence Interval</h3>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
          <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={50} />
          <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={40} />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: 'rgba(var(--card), 0.95)', backdropFilter: 'blur(10px)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
            itemStyle={{ color: 'var(--foreground)', fontSize: '13px' }}
            labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px', fontSize: '12px' }}
          />
          <Area type="monotone" dataKey="upper" stroke="none" fill="#ec4899" fillOpacity={0.08} isAnimationActive={true} />
          <Area type="monotone" dataKey="lower" stroke="none" fill="var(--card)" fillOpacity={1} isAnimationActive={true} />
          
          <Area type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" activeDot={{ r: 6, fill: '#3b82f6', stroke: 'var(--background)', strokeWidth: 2 }} />
          <Area type="monotone" dataKey="forecast" stroke="#ec4899" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorForecast)" activeDot={{ r: 6, fill: '#ec4899', stroke: 'var(--background)', strokeWidth: 2 }} />
          
          <Brush dataKey="date" height={30} stroke="var(--border)" fill="var(--card)" tickFormatter={() => ''} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
