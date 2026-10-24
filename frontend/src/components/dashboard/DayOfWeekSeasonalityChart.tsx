import { useMemo } from 'react';
import { Card } from '../ui/Card';
import { Clock, Activity } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from 'recharts';

interface DayOfWeekSeasonalityChartProps {
  dates: string[];
  values: number[];
}

export function DayOfWeekSeasonalityChart({ dates = [], values = [] }: DayOfWeekSeasonalityChartProps) {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const seasonalityData = useMemo(() => {
    if (!dates || dates.length === 0 || !values || values.length === 0) return [];

    const daySums = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    dates.forEach((dateStr, idx) => {
      const d = new Date(dateStr);
      // JS getDay(): 0 is Sunday, 1 is Monday... map to 0=Mon, 6=Sun
      const jsDay = d.getDay();
      const mappedIdx = jsDay === 0 ? 6 : jsDay - 1;
      daySums[mappedIdx] += values[idx] || 0;
      dayCounts[mappedIdx] += 1;
    });

    const overallAvg = values.reduce((a, b) => a + b, 0) / values.length;

    return dayNames.map((day, idx) => {
      const count = dayCounts[idx] || 1;
      const avg = Math.round(daySums[idx] / count);
      const diffFromAvg = Math.round(((avg - overallAvg) / overallAvg) * 100);

      return {
        day,
        avgDemand: avg,
        diffFromAvg,
        isWeekend: idx >= 5
      };
    });
  }, [dates, values]);

  if (seasonalityData.length === 0) return null;

  const peakDay = [...seasonalityData].sort((a, b) => b.avgDemand - a.avgDemand)[0];

  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[420px] flex flex-col justify-between">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-lg text-foreground">
              Day-of-Week Seasonality Pattern
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Expected demand variance across weekdays to schedule labor & deliveries
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            Peak: {peakDay.day} ({peakDay.diffFromAvg > 0 ? `+${peakDay.diffFromAvg}%` : `${peakDay.diffFromAvg}%`})
          </span>
        </div>
      </div>

      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={seasonalityData} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
            <XAxis 
              dataKey="day" 
              stroke="var(--muted-foreground)" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
            />
            <YAxis 
              stroke="var(--muted-foreground)" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false} 
              width={40}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)',
                fontSize: '12px'
              }}
              formatter={(val: any, name: any) => {
                if (name === 'avgDemand') return [`${Number(val).toLocaleString()} units`, 'Average Daily Demand'];
                return [val, name];
              }}
            />
            <Bar dataKey="avgDemand" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {seasonalityData.map((entry, i) => (
                <Cell 
                  key={i} 
                  fill={entry.day === peakDay.day ? '#ec4899' : entry.isWeekend ? '#8b5cf6' : '#6366f1'} 
                  fillOpacity={0.85} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#6366f1]"></span> Weekday
          <span className="w-2.5 h-2.5 rounded-sm bg-[#8b5cf6] ml-2"></span> Weekend
          <span className="w-2.5 h-2.5 rounded-sm bg-[#ec4899] ml-2"></span> Peak Day
        </span>
        <span className="font-mono text-foreground font-semibold">
          {peakDay.avgDemand.toLocaleString()} units peak avg
        </span>
      </div>
    </Card>
  );
}

