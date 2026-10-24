import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { SalesCharts } from "../components/analytics/SalesCharts";
import { Heatmap } from "../components/analytics/Heatmap";
import { InsightsFeed } from "../components/analytics/InsightsFeed";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { 
  Database, Target, CalendarDays, ShoppingBag, 
  ArrowRight, UploadCloud, Loader2, Sparkles 
} from "lucide-react";
import api from "../lib/axios";

interface ActiveDatasetSummary {
  id: number;
  name: string;
  total_rows: number;
  total_columns: number;
  date_col: string;
  target_col: string;
  date_range: string[];
  total_demand: number;
  avg_daily_demand: number;
  active_skus_count: number;
  active_stores_count: number;
  historical_series: Array<{ date: string; actual: number }>;
  category_distribution: Array<{ category: string; value: number }>;
  top_products: Array<{ name: string; volume: number }>;
  recent_alerts: Array<{ title: string; message: string; severity?: string }>;
}

interface DashboardData {
  has_datasets: boolean;
  total_datasets: number;
  datasets: Array<{ id: number; name: string; rows?: number; created_at?: string }>;
  active_dataset: ActiveDatasetSummary | null;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const url = selectedDatasetId ? `/dashboard?dataset_id=${selectedDatasetId}` : `/dashboard`;
        const res = await api.get(url);
        setData(res.data);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, [selectedDatasetId]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const activeDataset = data?.active_dataset;
  const datasets = data?.datasets || [];

  return (
    <div className="pb-16 max-w-[1600px] mx-auto space-y-8">
      {/* Hero Header with Active Dataset Selector */}
      <div className="w-full relative rounded-2xl overflow-hidden border border-border/50 shadow-sm bg-gradient-to-r from-primary/10 via-purple-500/5 to-transparent p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Live Data Operations Command Center
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight mb-2">
              Operations & Demand Dashboard
            </h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
              Telemetry and operational metrics computed directly from your imported datasets.
            </p>
          </div>

          {/* Dataset Switcher and Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {datasets.length > 0 && (
              <div className="relative">
                <select
                  value={activeDataset?.id || ""}
                  onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
                  className="w-full sm:w-auto appearance-none bg-background/90 border border-border/70 text-foreground font-medium rounded-xl px-4 py-2.5 pr-9 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm transition-colors cursor-pointer"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.rows ? `(${d.rows.toLocaleString()} rows)` : ""}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            )}

            <Link
              to="/forecast"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-all text-xs shadow-md whitespace-nowrap"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import New Dataset</span>
            </Link>
          </div>
        </div>
      </div>

      {!activeDataset ? (
        <Card className="p-12 text-center border-dashed border-2 flex flex-col items-center justify-center space-y-4">
          <div className="p-4 rounded-full bg-primary/10 text-primary">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-foreground">No Datasets Available</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Import a sales, inventory, or demand dataset (CSV, Excel, or Parquet) to populate live analytics and train machine learning forecasting models.
          </p>
          <Link
            to="/forecast"
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-all text-sm mt-2 shadow-md"
          >
            <span>Upload Dataset to Begin</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Card>
      ) : (
        <>
          {/* Real KPI Cards Taken from Imported Dataset */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Demand */}
            <Card className="p-6 border border-primary/20 bg-primary/5 shadow-sm hover:bg-primary/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Total {activeDataset.target_col}
                </span>
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mt-3 font-mono">
                {Math.round(activeDataset.total_demand).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                Sum of target variable across dataset
              </p>
            </Card>

            {/* Daily Average Demand */}
            <Card className="p-6 border border-emerald-500/20 bg-emerald-500/5 shadow-sm hover:bg-emerald-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Avg Daily Demand
                </span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mt-3 font-mono">
                {Math.round(activeDataset.avg_daily_demand).toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground ml-1">units/day</span>
              </p>
              <p className="text-xs text-emerald-500 font-medium mt-1.5 flex items-center gap-1">
                Across {activeDataset.active_stores_count} distribution channel(s)
              </p>
            </Card>

            {/* Ingested Records */}
            <Card className="p-6 border border-purple-500/20 bg-purple-500/5 shadow-sm hover:bg-purple-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Ingested Records
                </span>
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                  <Database className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mt-3 font-mono">
                {activeDataset.total_rows.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                {activeDataset.total_columns} columns · {activeDataset.name}
              </p>
            </Card>

            {/* Timeline Range */}
            <Card className="p-6 border border-amber-500/20 bg-amber-500/5 shadow-sm hover:bg-amber-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Timeline Span
                </span>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <CalendarDays className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground mt-3 font-mono truncate">
                {activeDataset.date_range[0]}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                → {activeDataset.date_range[1]} ({activeDataset.active_skus_count} SKUs)
              </p>
            </Card>
          </div>

          {/* Real Historical Chart + Real Dataset Insights Feed */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            <div className="xl:col-span-8">
              <ErrorBoundary>
                <SalesCharts 
                  historicalData={activeDataset.historical_series}
                  datasetName={activeDataset.name}
                  targetCol={activeDataset.target_col}
                  avgDailyDemand={activeDataset.avg_daily_demand}
                  totalDemand={activeDataset.total_demand}
                />
              </ErrorBoundary>
            </div>

            <div className="xl:col-span-4">
              <ErrorBoundary>
                <InsightsFeed 
                  alerts={activeDataset.recent_alerts}
                  datasetName={activeDataset.name}
                  categoryDistribution={activeDataset.category_distribution}
                  datasetId={activeDataset.id}
                />
              </ErrorBoundary>
            </div>
          </div>

          {/* Real Category & SKU Breakdown */}
          <div>
            <ErrorBoundary>
              <Heatmap 
                categoryData={activeDataset.category_distribution}
                topProducts={activeDataset.top_products}
                targetCol={activeDataset.target_col}
              />
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}
