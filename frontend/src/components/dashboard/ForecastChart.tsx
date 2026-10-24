import { Card } from '../ui/Card';
import { TrendingUp } from 'lucide-react';
import { 
  Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ComposedChart, Brush 
} from 'recharts';

interface ForecastChartProps {
  data: any[];
}

export function ForecastChart({ data }: ForecastChartProps) {
  // Ensure each data point has a clean range array [lower, upper] for native interval band
  const formattedData = data.map(item => ({
    ...item,
    range: (item.lower !== null && item.upper !== null && item.lower !== undefined && item.upper !== undefined) 
      ? [item.lower, item.upper] 
      : null
  }));

  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl h-[560px] flex flex-col justify-between">
      {/* Header and Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg text-foreground">
              Demand Forecast Trajectory & 95% Expanding Prediction Interval
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recursive multi-step forecast with statistically compounding horizon uncertainty.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-blue-500 rounded-full"></span>
            <span className="text-muted-foreground">Historical Actuals</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t-2 border-dashed border-pink-500"></span>
            <span className="text-muted-foreground">Model Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 bg-pink-500/20 border border-pink-500/50 rounded-sm"></span>
            <span className="text-muted-foreground">95% Interval (±1.96σ)</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[430px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={formattedData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0.0} />
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
              width={45} 
            />
            
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                backdropFilter: 'blur(12px)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)', 
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' 
              }}
              itemStyle={{ color: '#ffffff', fontSize: '12px', padding: '2px 0' }}
              labelStyle={{ color: '#a1a1aa', marginBottom: '6px', fontSize: '11px', fontWeight: 600 }}
              formatter={(val: any, name: any) => {
                if (Array.isArray(val)) {
                  return [`${val[0].toFixed(1)} – ${val[1].toFixed(1)} units`, '95% Confidence Band'];
                }
                const numVal = typeof val === 'number' ? val.toFixed(1) : val;
                if (name === 'actual') return [`${numVal} units`, 'Historical Actual'];
                if (name === 'forecast') return [`${numVal} units`, 'Forecasted Demand'];
                return [numVal, name];
              }}
            />

            {/* 95% Expanding Prediction Interval Ribbon */}
            <Area 
              type="monotone" 
              dataKey="range" 
              stroke="#ec4899" 
              strokeWidth={1} 
              strokeDasharray="2 2"
              fill="#ec4899" 
              fillOpacity={0.12} 
              isAnimationActive={false} 
              name="range"
            />
            
            {/* Historical Actuals */}
            <Area 
              type="monotone" 
              dataKey="actual" 
              stroke="#3b82f6" 
              strokeWidth={2.2} 
              fillOpacity={1} 
              fill="url(#colorActual)" 
              activeDot={{ r: 5, fill: '#3b82f6', stroke: 'var(--background)', strokeWidth: 2 }} 
              isAnimationActive={false}
              name="actual"
            />

            {/* Recursive Forecast Line */}
            <Area 
              type="monotone" 
              dataKey="forecast" 
              stroke="#ec4899" 
              strokeWidth={2.2} 
              strokeDasharray="4 4" 
              fillOpacity={1} 
              fill="url(#colorForecast)" 
              activeDot={{ r: 5, fill: '#ec4899', stroke: 'var(--background)', strokeWidth: 2 }} 
              isAnimationActive={false}
              name="forecast"
            />
            
            <Brush 
              dataKey="date" 
              height={26} 
              stroke="var(--border)" 
              fill="var(--card)" 
              tickFormatter={() => ''} 
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
