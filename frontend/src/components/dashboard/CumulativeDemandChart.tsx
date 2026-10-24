import { useMemo } from 'react';
import { Card } from '../ui/Card';
import { PackageCheck, ArrowUpRight } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';

interface CumulativeDemandChartProps {
  dates: string[];
  values: number[];
  lower?: number[];
  upper?: number[];
}

export function CumulativeDemandChart({ dates = [], values = [], lower = [], upper = [] }: CumulativeDemandChartProps) {
  const cumulativeData = useMemo(() => {
    if (!dates || dates.length === 0 || !values || values.length === 0) return [];

    let runningTotal = 0;
    let runningLower = 0;
    let runningUpper = 0;

    return dates.map((date, idx) => {
      const val = values[idx] || 0;
      const low = lower[idx] !== undefined ? lower[idx] : val * 0.85;
      const up = upper[idx] !== undefined ? upper[idx] : val * 1.15;

      runningTotal += val;
      runningLower += low;
      runningUpper += up;

      return {
        date,
        cumulative: Math.round(runningTotal),
        cumLower: Math.round(runningLower),
        cumUpper: Math.round(runningUpper),
        range: [Math.round(runningLower), Math.round(runningUpper)]
      };
    });
  }, [dates, values, lower, upper]);

  if (cumulativeData.length === 0) return null;

  const finalTotal = cumulativeData[cumulativeData.length - 1]?.cumulative || 0;
  const finalLower = cumulativeData[cumulativeData.length - 1]?.cumLower || 0;
  const finalUpper = cumulativeData[cumulativeData.length - 1]?.cumUpper || 0;

  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[420px] flex flex-col justify-between">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-lg text-foreground">
              Cumulative Inventory Procurement Curve
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total cumulative stock depletion over horizon for replenishment planning
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <span className="text-muted-foreground">Required Stock Buffer: </span>
            <span className="font-mono font-bold text-foreground text-sm">
              {finalTotal.toLocaleString()} units
            </span>
            <span className="text-[10px] text-muted-foreground block font-mono">
              Range: {finalLower.toLocaleString()} – {finalUpper.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={cumulativeData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
            <XAxis 
              dataKey="date" 
              stroke="var(--muted-foreground)" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false} 
              minTickGap={40}
            />
            <YAxis 
              stroke="var(--muted-foreground)" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)',
                fontSize: '12px'
              }}
              formatter={(val: any, name: any) => {
                if (name === 'range') return [`${val[0].toLocaleString()} – ${val[1].toLocaleString()} units`, '95% Uncertainty Band'];
                return [`${Number(val).toLocaleString()} units`, 'Cumulative Demand'];
              }}
            />
            <Area 
              type="monotone" 
              dataKey="range" 
              stroke="#10b981" 
              strokeWidth={1} 
              strokeDasharray="2 2"
              fill="#10b981" 
              fillOpacity={0.08} 
              isAnimationActive={false} 
              name="range"
            />
            <Area 
              type="monotone" 
              dataKey="cumulative" 
              stroke="#10b981" 
              strokeWidth={2.5} 
              fillOpacity={1} 
              fill="url(#colorCumulative)" 
              isAnimationActive={false} 
              name="cumulative"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
        <span>Steepness indicates acceleration in expected customer ordering.</span>
        <span className="font-mono text-emerald-500 flex items-center gap-1">
          Stock Requirement: {finalTotal.toLocaleString()} units <ArrowUpRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Card>
  );
}

