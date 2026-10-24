import React, { useMemo } from "react";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";

interface SalesChartsProps {
  historicalData: Array<{ date: string; actual: number }>;
  datasetName?: string;
  targetCol?: string;
  avgDailyDemand?: number;
  totalDemand?: number;
}

export const SalesCharts = React.memo(function SalesCharts({
  historicalData = [],
  datasetName = "Imported Dataset",
  targetCol = "Demand / Units Sold",
  avgDailyDemand = 0,
  totalDemand = 0,
}: SalesChartsProps) {
  // Compute 7-day rolling moving average over the real historical series
  const chartData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return [];
    
    return historicalData.map((item, idx, arr) => {
      const windowStart = Math.max(0, idx - 6);
      const windowSlice = arr.slice(windowStart, idx + 1);
      const movingAvg = windowSlice.reduce((sum, curr) => sum + curr.actual, 0) / windowSlice.length;
      
      return {
        date: item.date,
        actual: Math.round(item.actual),
        trend: Math.round(movingAvg),
      };
    });
  }, [historicalData]);

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="p-8 h-[420px] flex flex-col justify-center items-center">
        <EmptyState 
          title="No Dataset Imported" 
          description="Import a CSV, Excel, or Parquet dataset to visualize real historical demand and time-series patterns." 
        />
      </Card>
    );
  }

  const startDate = chartData[0]?.date;
  const endDate = chartData[chartData.length - 1]?.date;

  return (
    <div className="space-y-6">
      {/* Main Historical Demand Volume Chart */}
      <Card className="p-6 h-[400px] backdrop-blur-2xl bg-card/60 border border-border/50 shadow-sm flex flex-col justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg text-foreground">
                Historical Demand Timeline — {datasetName}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily aggregated {targetCol} from {startDate} to {endDate} ({chartData.length} recorded days)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-3 h-3 rounded-full bg-primary/80"></span> Daily Actuals
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-3 h-0.5 bg-amber-500"></span> 7-Day Trend
            </span>
          </div>
        </div>

        <div className="flex-1 w-full min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
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
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                  fontSize: '12px'
                }}
                itemStyle={{ color: '#ffffff' }}
                labelStyle={{ color: '#a1a1aa', fontWeight: 600, marginBottom: '4px' }}
                formatter={(val: any, name: any) => [
                  `${Number(val).toLocaleString()} units`,
                  name === 'actual' ? 'Daily Actual' : '7-Day Rolling Trend'
                ]}
              />
              <Area 
                type="monotone" 
                dataKey="actual" 
                stroke="var(--primary)" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorActual)" 
                isAnimationActive={false} 
                activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="trend" 
                stroke="#f59e0b" 
                strokeWidth={2} 
                dot={false} 
                isAnimationActive={false} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground mt-2">
          <span>Average Daily Volume: <strong className="text-foreground font-mono">{Math.round(avgDailyDemand).toLocaleString()} units/day</strong></span>
          <span>Window Total: <strong className="text-foreground font-mono">{Math.round(totalDemand).toLocaleString()} units</strong></span>
        </div>
      </Card>
    </div>
  );
});
