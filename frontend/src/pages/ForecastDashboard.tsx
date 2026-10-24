import React, { useMemo, useRef } from 'react';
import { BrainCircuit } from 'lucide-react';
import { AIInsights } from '../components/dashboard/AIInsights';
import { KPIBanner } from '../components/dashboard/KPIBanner';
import { DatasetSummary } from '../components/dashboard/DatasetSummary';
import { ModelComparisonTable } from '../components/dashboard/ModelComparisonTable';
import { ForecastChart } from '../components/dashboard/ForecastChart';
import { MonthlyForecastChart } from '../components/dashboard/MonthlyForecastChart';
import { CumulativeDemandChart } from '../components/dashboard/CumulativeDemandChart';
import { DayOfWeekSeasonalityChart } from '../components/dashboard/DayOfWeekSeasonalityChart';
import { ResidualAnalysis } from '../components/dashboard/ResidualAnalysis';
import { SHAPAnalysis } from '../components/dashboard/SHAPAnalysis';
import { ForecastDataTable } from '../components/dashboard/ForecastDataTable';
import { ExportCenter } from '../components/dashboard/ExportCenter';

export const ForecastDashboard = React.memo(function ForecastDashboard({ data, onRestart }: { data: any, onRestart: () => void }) {
  const { champion_model, metrics, analytics } = data;
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Safely extract dataset metadata and model comparison
  const metadata = analytics.dataset_metadata || {};
  const models = analytics.model_comparison || [];
  const residualAnalysis = analytics.residual_analysis || { mean: 0, std: 0, histogram: [], qq_plot: [] };

  // Prepare data for Main Chart
  const mainChartData = useMemo(() => {
    const hist = analytics.historical_dates.map((date: string, i: number) => ({
      date, actual: analytics.historical_actuals[i], lower: null, upper: null, forecast: null
    }));
    const future = analytics.forecast_dates.map((date: string, i: number) => ({
      date, actual: null, forecast: analytics.forecast_values[i], lower: analytics.ci_lower[i], upper: analytics.ci_upper[i]
    }));
    if (hist.length > 0 && future.length > 0) {
      const lastHist = hist[hist.length - 1];
      future.unshift({ ...lastHist, forecast: lastHist.actual, lower: lastHist.actual, upper: lastHist.actual });
    }
    return [...hist, ...future];
  }, [analytics]);

  const residualScatterData = useMemo(() => {
    if (residualAnalysis.scatter && residualAnalysis.scatter.length > 0) {
      return residualAnalysis.scatter;
    }
    if (!analytics.test_actual || !analytics.test_predicted) return [];
    return analytics.test_actual.map((act: number, i: number) => ({
      actual: act, 
      predicted: analytics.test_predicted[i] ?? act,
      residual: act - (analytics.test_predicted[i] ?? act)
    }));
  }, [analytics, residualAnalysis]);

  const featureData = useMemo(() => {
    const importances = analytics.shap_values || analytics.feature_importance || {};
    return Object.entries(importances)
      .map(([feature, val]) => ({ feature, importance: Number(val) }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
  }, [analytics]);
  
  return (
    <div className="space-y-8 min-h-screen pb-20 pt-4" ref={dashboardRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-primary" />
            AI Analytics Workspace
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Enterprise-grade forecasting and automated data insights.</p>
        </div>
        
        <div className="flex gap-3">
          <ExportCenter dashboardRef={dashboardRef} mainChartData={mainChartData} metrics={metrics} champion_model={champion_model} />
          <button onClick={onRestart} className="px-6 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-xl font-medium transition-all shadow-md">
            New Forecast
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <KPIBanner 
        champion_model={champion_model} 
        metrics={metrics} 
        metadata={metadata} 
        confidence={analytics.confidence || data.confidence}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 min-w-0 w-full">
        {/* Left Side: Model Comparison & Dataset Summary */}
        <div className="col-span-1 lg:col-span-1 space-y-8 min-w-0">
          <DatasetSummary metadata={metadata} />
          <ModelComparisonTable models={models} />
        </div>

        {/* Right Side: Charts */}
        <div className="col-span-1 lg:col-span-3 space-y-8 min-w-0">
          <AIInsights insights={analytics?.insights || []} />
          
          {/* 1. Main Daily Forecast Trajectory Chart */}
          <ForecastChart data={mainChartData} />

          {/* 2. Monthly Projected Aggregates & Multi-Month Trend Chart */}
          <MonthlyForecastChart 
            dates={analytics.forecast_dates}
            values={analytics.forecast_values}
            lower={analytics.ci_lower}
            upper={analytics.ci_upper}
            historicalDates={analytics.historical_dates}
            historicalActuals={analytics.historical_actuals}
          />

          {/* 3. Cumulative Procurement Curve & Day-of-Week Seasonality */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <CumulativeDemandChart 
              dates={analytics.forecast_dates}
              values={analytics.forecast_values}
              lower={analytics.ci_lower}
              upper={analytics.ci_upper}
            />
            <DayOfWeekSeasonalityChart 
              dates={analytics.forecast_dates}
              values={analytics.forecast_values}
            />
          </div>

          {/* 4. Model Explainability & Residual Diagnostics */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <SHAPAnalysis featureData={featureData} />
            <ResidualAnalysis 
               scatterData={residualScatterData} 
               histogramData={residualAnalysis.histogram}
               qqData={residualAnalysis.qq_plot}
               mean={residualAnalysis.mean}
               std={residualAnalysis.std}
            />
          </div>
          
          <ForecastDataTable 
            dates={analytics.forecast_dates}
            values={analytics.forecast_values}
            lower={analytics.ci_lower}
            upper={analytics.ci_upper}
          />
        </div>
      </div>
    </div>
  );
});
