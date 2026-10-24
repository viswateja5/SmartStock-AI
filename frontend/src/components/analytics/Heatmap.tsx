import React from "react";
import { Card } from "../ui/Card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Layers, Package } from "lucide-react";

interface CategoryBreakdownProps {
  categoryData?: Array<{ category: string; value: number }>;
  topProducts?: Array<{ name: string; volume: number }>;
  targetCol?: string;
}

export const Heatmap = React.memo(function Heatmap({
  categoryData = [],
  topProducts = [],
  targetCol = "Units Sold"
}: CategoryBreakdownProps) {
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Category Demand Distribution Chart */}
      <Card className="lg:col-span-7 p-6 h-[400px] flex flex-col justify-between backdrop-blur-2xl bg-card/60 border border-border/50 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground text-lg">Category Demand Breakdown</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggregated historical {targetCol} distribution across product categories
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
            {categoryData.length} Categories
          </span>
        </div>

        <div className="flex-1 w-full min-h-[280px]">
          {categoryData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No category column detected in this dataset.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={categoryData} margin={{ top: 10, right: 30, left: 60, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis 
                  type="number" 
                  stroke="var(--muted-foreground)" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <YAxis 
                  dataKey="category" 
                  type="category" 
                  stroke="var(--muted-foreground)" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  width={75}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(23, 23, 28, 0.95)', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border)',
                    fontSize: '12px' 
                  }}
                  itemStyle={{ color: '#ffffff' }}
                  formatter={(val: any) => [`${Number(val).toLocaleString()} units`, 'Total Demand']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Top SKUs / Products Table */}
      <Card className="lg:col-span-5 p-6 h-[400px] flex flex-col justify-between backdrop-blur-2xl bg-card/60 border border-border/50 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground text-lg">Top Performing SKUs</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Highest volume items recorded in imported dataset</p>

          <div className="space-y-3">
            {topProducts.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No distinct SKU/Product identifiers found in dataset.
              </div>
            ) : (
              topProducts.map((prod, idx) => (
                <div 
                  key={prod.name} 
                  className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-card/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center font-mono">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-xs text-foreground truncate max-w-[150px]">{prod.name}</p>
                      <p className="text-[11px] text-muted-foreground">High volume product</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-xs text-foreground">{prod.volume.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">total units</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-border/50 pt-3 text-[11px] text-muted-foreground flex justify-between">
          <span>Ranked by cumulative historical volume</span>
          <span className="font-mono text-primary">Imported Records</span>
        </div>
      </Card>
    </div>
  );
});
