import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, BarChart3, AlertTriangle, Layers, Target, Loader2, Info, 
  Sparkles, Sliders, CheckCircle2, Download, Play, X, RefreshCw, 
  Check, FileSpreadsheet, TrendingUp, AlertOctagon, HelpCircle, FileText
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip as RechartsTooltip, Cell, LineChart, Line, CartesianGrid 
} from 'recharts';
import api from '../lib/axios';
import { Card } from '../components/ui/Card';
import toast from 'react-hot-toast';

interface EDAMetadata {
  num_rows: number;
  num_cols: number;
  duplicates: number;
  missing: Record<string, number>;
  dtypes: Record<string, string>;
  outliers: Record<string, number>;
  target_suggestions: string[];
  correlation_matrix: { x: string; y: string; value: number }[];
}

interface ColumnQualityProfile {
  name: string;
  type: string;
  role: string;
  total_count: number;
  missing_count: number;
  missing_percentage: number;
  outliers_count: number;
  outliers_percentage: number;
  unique_count: number;
  invalid_count: number;
  leakage_risk: boolean;
  min_value?: number;
  max_value?: number;
  mean_value?: number;
  median_value?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  lower_bound?: number;
  upper_bound?: number;
  recommendation: {
    recommended_missing_strategy: string;
    missing_reason: string;
    recommended_outlier_strategy: string;
    outlier_reason: string;
    expected_benefit: string;
    confidence: string;
  };
}

interface DataQualityProfileResponse {
  dataset_id: number;
  dataset_name: string;
  total_rows: number;
  total_columns: number;
  duplicate_rows_count: number;
  quality_score: {
    overall_score: number;
    rating: string;
    missingness_score: number;
    outlier_score: number;
    business_validity_score: number;
  };
  columns: ColumnQualityProfile[];
  business_rule_violations: Array<{
    rule_name: string;
    column: string;
    violation_count: number;
    description: string;
  }>;
}

interface ColumnCleaningConfig {
  column_name: string;
  missing_strategy: string;
  custom_fill_value?: string;
  outlier_strategy: string;
  iqr_multiplier: number;
  percentile_lower: number;
  percentile_upper: number;
  group_by_column?: string;
}

interface CleaningPreviewResponse {
  dataset_id: number;
  original_rows_count: number;
  cleaned_rows_count: number;
  rows_removed: number;
  total_values_imputed: number;
  total_outliers_treated: number;
  missing_before: number;
  missing_after: number;
  outliers_before: number;
  outliers_after: number;
  column_audit: any[];
  preview_original: any[];
  preview_cleaned: any[];
}

interface ModelComparisonResponse {
  model_type: string;
  horizon_days: number;
  baseline_metrics: Record<string, number>;
  cleaned_metrics: Record<string, number>;
  improvement: Record<string, number>;
  is_statistically_improved: boolean;
  summary_verdict: string;
  forecast_comparison: Array<{
    date: string;
    baseline_forecast: number;
    cleaned_forecast: number;
    difference: number;
  }>;
}

export function DatasetEDA() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Existing EDA states
  const [data, setData] = useState<EDAMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Enhanced Data Quality states
  const [qualityProfile, setQualityProfile] = useState<DataQualityProfileResponse | null>(null);
  const [configs, setConfigs] = useState<Record<string, ColumnCleaningConfig>>({});
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [dropLeakage, setDropLeakage] = useState(false);

  // Active Modals: 'none' | 'missing' | 'outliers' | 'preview' | 'benchmark'
  const [activeModal, setActiveModal] = useState<'none' | 'missing' | 'outliers' | 'preview' | 'benchmark'>('none');

  // Async Action states
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);

  // Action Results
  const [previewData, setPreviewData] = useState<CleaningPreviewResponse | null>(null);
  const [cleanedDatasetInfo, setCleanedDatasetInfo] = useState<{ id: number; name: string } | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<ModelComparisonResponse | null>(null);

  // Fetch EDA and Quality Profile
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [edaRes, qualityRes] = await Promise.all([
          api.get(`/datasets/${id}/eda`),
          api.get(`/quality/${id}/profile`).catch(() => null)
        ]);
        setData(edaRes.data);

        if (qualityRes?.data) {
          setQualityProfile(qualityRes.data);
          const initConfigs: Record<string, ColumnCleaningConfig> = {};
          qualityRes.data.columns.forEach((col: ColumnQualityProfile) => {
            initConfigs[col.name] = {
              column_name: col.name,
              missing_strategy: col.recommendation.recommended_missing_strategy || 'unchanged',
              custom_fill_value: '',
              outlier_strategy: col.recommendation.recommended_outlier_strategy || 'keep_unchanged',
              iqr_multiplier: 1.5,
              percentile_lower: 1.0,
              percentile_upper: 99.0
            };
          });
          setConfigs(initConfigs);
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load dataset profiling data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleConfigChange = (colName: string, field: keyof ColumnCleaningConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [colName]: {
        ...prev[colName],
        [field]: value
      }
    }));
  };

  // 1. Preview Changes Action
  const handlePreviewChanges = async () => {
    if (!id) return;
    try {
      setPreviewing(true);
      const payload = {
        columns: Object.values(configs),
        remove_duplicates: removeDuplicates,
        drop_leakage_columns: dropLeakage
      };
      const res = await api.post(`/quality/${id}/preview`, payload);
      setPreviewData(res.data);
      setActiveModal('preview');
      toast.success('Dry-run preview generated successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to generate cleaning preview.');
    } finally {
      setPreviewing(false);
    }
  };

  // 2. Apply Cleaning Action
  const handleApplyCleaning = async () => {
    if (!id) return;
    try {
      setApplying(true);
      const payload = {
        columns: Object.values(configs),
        remove_duplicates: removeDuplicates,
        drop_leakage_columns: dropLeakage,
        cleaned_dataset_name: `Cleaned (${new Date().toLocaleDateString()}) - ${qualityProfile?.dataset_name || `Dataset #${id}`}`
      };
      const res = await api.post(`/quality/${id}/apply`, payload);
      setCleanedDatasetInfo({
        id: res.data.cleaned_dataset_id,
        name: res.data.cleaned_dataset_name
      });
      toast.success(`Dataset cleaned! Saved as ID #${res.data.cleaned_dataset_id}`);
      setActiveModal('none');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to apply cleaning.');
    } finally {
      setApplying(false);
    }
  };

  // 3. Download Cleaned Dataset (CSV or Excel)
  const handleDownload = async (format: 'csv' | 'xlsx' = 'csv') => {
    const targetId = cleanedDatasetInfo?.id || id;
    if (!targetId) return;
    try {
      toast.loading(`Preparing ${format.toUpperCase()} download...`, { id: 'download' });
      const response = await api.get(`/quality/${targetId}/download?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const base = cleanedDatasetInfo ? `cleaned_dataset_${targetId}` : `dataset_${targetId}`;
      link.setAttribute('download', `${base}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Downloaded ${format.toUpperCase()} successfully!`, { id: 'download' });
    } catch (err) {
      toast.error('Download failed.', { id: 'download' });
    }
  };

  // 4. Train & Benchmark Forecasting Models
  const handleTrainBenchmark = async () => {
    if (!cleanedDatasetInfo) {
      toast.error('Please click "Apply Cleaning" first to generate the cleaned dataset.');
      return;
    }
    try {
      setBenchmarking(true);
      setActiveModal('benchmark');
      const payload = {
        original_dataset_id: Number(id),
        cleaned_dataset_id: cleanedDatasetInfo.id,
        model_type: 'xgboost',
        horizon: 14
      };
      const res = await api.post('/quality/compare-models', payload);
      setBenchmarkResult(res.data);
      toast.success('Forecasting model benchmark completed!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Model evaluation failed.');
    } finally {
      setBenchmarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button onClick={() => navigate('/datasets')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Datasets
        </button>
        <div className="p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center gap-3">
          <AlertTriangle className="w-6 h-6" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const numericCols = Object.keys(data.outliers);
  const outlierChartData = numericCols.map(col => ({
    name: col,
    outliers: data.outliers[col]
  }));

  const missingChartData = Object.keys(data.missing)
    .filter(k => data.missing[k] > 0)
    .map(k => ({ name: k, missing: data.missing[k] }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 pb-20">
      {/* Top Header & Prominent Clean Dataset Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-card via-card to-primary/5 p-6 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/datasets')} className="p-2 hover:bg-muted/50 rounded-xl text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-1 border border-primary/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Data Quality & Preprocessing</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Data Profiling & Quality</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Automated EDA with Production Imputation & Outlier Treatment</p>
          </div>
        </div>

        {/* Action Buttons Panel */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Prominent Clean Dataset Button */}
          <button
            onClick={() => setActiveModal('missing')}
            className="px-4 py-2.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-md shadow-primary/20 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4" />
            <span>Clean Dataset</span>
          </button>

          {/* 2. Handle Missing Values Button */}
          <button
            onClick={() => setActiveModal('missing')}
            className="px-3.5 py-2.5 bg-card hover:bg-muted/60 border border-border text-foreground font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>Handle Missing Values</span>
          </button>

          {/* 3. Treat Outliers Button */}
          <button
            onClick={() => setActiveModal('outliers')}
            className="px-3.5 py-2.5 bg-card hover:bg-muted/60 border border-border text-foreground font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Treat Outliers</span>
          </button>

          {/* 4. Preview Changes Button */}
          <button
            onClick={handlePreviewChanges}
            disabled={previewing}
            className="px-3.5 py-2.5 bg-card hover:bg-muted/60 border border-border text-foreground font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
          >
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Layers className="w-3.5 h-3.5 text-indigo-500" />}
            <span>Preview Changes</span>
          </button>

          {/* 5. Apply Cleaning Button */}
          <button
            onClick={handleApplyCleaning}
            disabled={applying}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>Apply Cleaning</span>
          </button>

          {/* 6. Download Cleaned Dataset (Dropdown / Direct) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDownload('csv')}
              className="px-3 py-2.5 bg-card hover:bg-muted/60 border border-border text-foreground font-medium rounded-l-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => handleDownload('xlsx')}
              className="px-3 py-2.5 bg-card hover:bg-muted/60 border border-border border-l-0 text-foreground font-medium rounded-r-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              title="Download Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span>Excel</span>
            </button>
          </div>

          {/* 7. Train & Benchmark Button */}
          {cleanedDatasetInfo && (
            <button
              onClick={handleTrainBenchmark}
              disabled={benchmarking}
              className="px-3.5 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {benchmarking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
              <span>Benchmark Forecast</span>
            </button>
          )}
        </div>
      </div>

      {/* Cleaned Dataset Notification Banner if applied */}
      {cleanedDatasetInfo && (
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Cleaned Dataset Created: #{cleanedDatasetInfo.id}</h4>
              <p className="text-xs text-muted-foreground">{cleanedDatasetInfo.name} — Separate file stored securely; original raw data preserved.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTrainBenchmark}
              className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg text-xs flex items-center gap-1 shadow-sm"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Train & Compare Models</span>
            </button>
            <button
              onClick={() => handleDownload('csv')}
              className="px-3 py-1.5 border border-border hover:bg-muted/50 rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Cleaned CSV</span>
            </button>
          </div>
        </Card>
      )}

      {/* Existing KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl"><Layers className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-muted-foreground">Rows</p>
            <p className="text-2xl font-bold">{data.num_rows.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl"><BarChart3 className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-muted-foreground">Columns</p>
            <p className="text-2xl font-bold">{data.num_cols.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl"><AlertTriangle className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-muted-foreground">Duplicate Rows</p>
            <p className="text-2xl font-bold">{data.duplicates.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl"><Target className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-muted-foreground">Target Candidates</p>
            <p className="text-2xl font-bold">{data.target_suggestions.length}</p>
          </div>
        </Card>
      </div>

      {/* Existing Charts and Schema Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Outlier Detection (IQR) */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Outlier Detection (IQR)
              </h3>
              <button
                onClick={() => setActiveModal('outliers')}
                className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
              >
                <span>Configure Outlier Treatment</span>
                <Sliders className="w-3 h-3" />
              </button>
            </div>

            <div className="h-[300px]">
              {outlierChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outlierChartData}>
                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                    <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: 'rgba(10,10,10,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                    <Bar dataKey="outliers" radius={[4, 4, 0, 0]}>
                      {outlierChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.outliers > (data.num_rows * 0.05) ? '#ef4444' : '#8b5cf6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No numerical columns found</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
              <Info className="w-3 h-3" /> Columns in red have &gt;5% outliers and may require preprocessing. Click "Treat Outliers" above to configure capping or median replacement.
            </p>
          </Card>

          {/* Missing Values Count */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-rose-500" /> Missing Values Count
              </h3>
              <button
                onClick={() => setActiveModal('missing')}
                className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
              >
                <span>Configure Missing Imputation</span>
                <Sliders className="w-3 h-3" />
              </button>
            </div>

            <div className="h-[300px]">
              {missingChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={missingChartData}>
                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: 'rgba(10,10,10,0.8)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                    <Bar dataKey="missing" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  Excellent! No missing values detected in any column.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Target Suggestions & Schema & Types */}
        <div className="space-y-8">
          <Card className="p-6 bg-primary/5 border-primary/20">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" /> Target Suggestions
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Based on variance and data types, the AI suggests the following columns for forecasting:
            </p>
            <div className="flex flex-wrap gap-2">
              {data.target_suggestions.length > 0 ? (
                data.target_suggestions.map(target => (
                  <span key={target} className="px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-sm font-medium border border-primary/30">
                    {target}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No suitable targets found.</span>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Schema & Types</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(data.dtypes).map(([col, type]) => (
                <div key={col} className="flex justify-between items-center p-2 rounded-lg hover:bg-card transition-colors">
                  <span className="font-medium text-sm truncate max-w-[150px]" title={col}>{col}</span>
                  <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-md uppercase tracking-wider">{type}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: HANDLE MISSING VALUES PANEL                          */}
      {/* ============================================================ */}
      {activeModal === 'missing' && qualityProfile && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <span>Configure Missing Value Imputation</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select tailored imputation per column. Target column missingness is protected from synthetic fabrication.
                </p>
              </div>
              <button onClick={() => setActiveModal('none')} className="p-2 hover:bg-muted/50 rounded-xl text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-3">
                {qualityProfile.columns.map((col) => {
                  const cfg = configs[col.name] || {
                    column_name: col.name,
                    missing_strategy: 'unchanged',
                    custom_fill_value: '',
                    outlier_strategy: 'keep_unchanged',
                    iqr_multiplier: 1.5,
                    percentile_lower: 1.0,
                    percentile_upper: 99.0
                  };
                  const isNumeric = ['numerical', 'int64', 'float64'].some(t => col.type.includes(t) || col.role === 'numerical');
                  const isTarget = col.role === 'target' || col.name.toLowerCase().includes('units_sold');

                  return (
                    <div key={col.name} className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">{col.name}</span>
                            <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                              {col.type}
                            </span>
                            {isTarget && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                Target Column
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Missing: <strong className={col.missing_count > 0 ? "text-rose-500" : "text-emerald-500"}>
                              {col.missing_count} rows ({col.missing_percentage}%)
                            </strong>
                          </div>
                        </div>

                        {/* Dropdown strategy selection */}
                        <div className="flex flex-col sm:items-end">
                          <label className="text-[10px] text-muted-foreground mb-1 font-medium">Selected Treatment</label>
                          <select
                            value={cfg.missing_strategy}
                            onChange={(e) => handleConfigChange(col.name, 'missing_strategy', e.target.value)}
                            className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none min-w-[200px]"
                          >
                            <option value="unchanged">Leave Unchanged</option>
                            {isNumeric ? (
                              <>
                                <option value="median">Median Imputation</option>
                                <option value="mean">Mean Imputation</option>
                                <option value="forward_fill">Forward Fill (Time-Series)</option>
                                <option value="linear_interpolation">Linear Interpolation</option>
                                <option value="group_median">Group-wise Median</option>
                                <option value="custom_value">Fill with User-Specified Value</option>
                                <option value="exclude_rows">Exclude Rows (Safe for Target)</option>
                              </>
                            ) : (
                              <>
                                <option value="mode">Mode Imputation (Most Frequent)</option>
                                <option value="missing_category">Explicit 'Unknown' Category</option>
                                <option value="forward_fill">Forward Fill</option>
                                <option value="custom_value">Fill with Custom Text</option>
                                <option value="exclude_rows">Exclude Rows</option>
                              </>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Custom value input if selected */}
                      {cfg.missing_strategy === 'custom_value' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border/40 text-xs">
                          <span className="text-muted-foreground">User-specified constant value:</span>
                          <input
                            type="text"
                            placeholder={isNumeric ? "e.g. 0" : "e.g. Standard"}
                            value={cfg.custom_fill_value || ''}
                            onChange={(e) => handleConfigChange(col.name, 'custom_fill_value', e.target.value)}
                            className="bg-card border border-border rounded px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary w-48"
                          />
                        </div>
                      )}

                      {/* AI recommendation badge */}
                      <div className="bg-primary/5 p-2 rounded-lg border border-primary/15 text-xs flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-primary font-medium text-[11px]">
                          <Sparkles className="w-3.5 h-3.5" />
                          Recommended: {col.recommendation.recommended_missing_strategy}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[450px]">
                          {col.recommendation.missing_reason}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between bg-card">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveModal('outliers')}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl text-xs font-semibold"
                >
                  Configure Outliers &rarr;
                </button>
                <button
                  onClick={handlePreviewChanges}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold shadow-sm"
                >
                  Preview Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: TREAT OUTLIERS PANEL                                 */}
      {/* ============================================================ */}
      {activeModal === 'outliers' && qualityProfile && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <span>Treat Detected Outliers & Anomalies</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review IQR thresholds, lower/upper bounds, and configure winsorizing capping or median replacements.
                </p>
              </div>
              <button onClick={() => setActiveModal('none')} className="p-2 hover:bg-muted/50 rounded-xl text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Column</th>
                      <th className="py-2.5 px-3">Outlier Count</th>
                      <th className="py-2.5 px-3">Lower IQR Bound</th>
                      <th className="py-2.5 px-3">Upper IQR Bound</th>
                      <th className="py-2.5 px-3">Range [Min, Max]</th>
                      <th className="py-2.5 px-3">Selected Treatment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {qualityProfile.columns
                      .filter(c => ['numerical', 'int64', 'float64'].some(t => c.type.includes(t) || c.role === 'numerical'))
                      .map((col) => {
                        const cfg = configs[col.name] || {
                          column_name: col.name,
                          missing_strategy: 'unchanged',
                          outlier_strategy: 'keep_unchanged',
                          iqr_multiplier: 1.5,
                          percentile_lower: 1.0,
                          percentile_upper: 99.0
                        };

                        return (
                          <tr key={col.name} className="hover:bg-muted/20">
                            <td className="py-3 px-3 font-semibold text-foreground">
                              {col.name}
                            </td>
                            <td className="py-3 px-3">
                              <span className={col.outliers_count > 0 ? "text-rose-500 font-bold" : "text-muted-foreground"}>
                                {col.outliers_count.toLocaleString()} ({col.outliers_percentage}%)
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                              {col.lower_bound !== undefined ? col.lower_bound : 'N/A'}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                              {col.upper_bound !== undefined ? col.upper_bound : 'N/A'}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                              [{col.min_value ?? '?'}, {col.max_value ?? '?'}]
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={cfg.outlier_strategy}
                                onChange={(e) => handleConfigChange(col.name, 'outlier_strategy', e.target.value)}
                                className="bg-card border border-border rounded px-2 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary"
                              >
                                <option value="keep_unchanged">Keep Unchanged</option>
                                <option value="cap_iqr">IQR-based Capping (1.5×)</option>
                                <option value="cap_percentile">Percentile Capping (1%-99%)</option>
                                <option value="replace_median">Median Replacement</option>
                                <option value="remove_rows">Remove Outlier Rows</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between bg-card">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveModal('missing')}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl text-xs font-semibold"
                >
                  &larr; Missing Values
                </button>
                <button
                  onClick={handlePreviewChanges}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold shadow-sm"
                >
                  Preview Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: PREVIEW CHANGES & APPLY CLEANING                     */}
      {/* ============================================================ */}
      {activeModal === 'preview' && previewData && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  <span>Dry-Run Transformation Diff Preview</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review proposed cell imputations and outlier adjustments before applying. Original uploaded file is never modified.
                </p>
              </div>
              <button onClick={() => setActiveModal('none')} className="p-2 hover:bg-muted/50 rounded-xl text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-muted/30 p-3 rounded-xl border border-border">
                  <div className="text-xs text-muted-foreground">Affected Imputed Cells</div>
                  <div className="text-xl font-bold text-emerald-500 mt-1">{previewData.total_values_imputed.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Missing cells filled</div>
                </div>

                <div className="bg-muted/30 p-3 rounded-xl border border-border">
                  <div className="text-xs text-muted-foreground">Rows Removed</div>
                  <div className="text-xl font-bold text-foreground mt-1">{previewData.rows_removed}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{previewData.cleaned_rows_count.toLocaleString()} rows retained</div>
                </div>

                <div className="bg-muted/30 p-3 rounded-xl border border-border">
                  <div className="text-xs text-muted-foreground">Missing Values (Before &rarr; After)</div>
                  <div className="text-xl font-bold text-primary mt-1">
                    {previewData.missing_before} &rarr; <span className="text-emerald-500">{previewData.missing_after}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Total null values</div>
                </div>

                <div className="bg-muted/30 p-3 rounded-xl border border-border">
                  <div className="text-xs text-muted-foreground">Outliers (Before &rarr; After)</div>
                  <div className="text-xl font-bold text-amber-500 mt-1">
                    {previewData.outliers_before} &rarr; <span className="text-emerald-500">{previewData.outliers_after}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">IQR boundary outliers</div>
                </div>
              </div>

              {/* Side-by-side Table Preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-0 overflow-hidden">
                  <div className="p-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground">
                    Original Values (Sample)
                  </div>
                  <div className="overflow-x-auto max-h-[220px]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-muted/20 text-muted-foreground sticky top-0">
                        <tr>
                          {Object.keys(previewData.preview_original[0] || {}).slice(0, 5).map(k => (
                            <th key={k} className="py-1.5 px-2.5">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {previewData.preview_original.slice(0, 8).map((row, idx) => (
                          <tr key={idx}>
                            {Object.keys(row).slice(0, 5).map(k => (
                              <td key={k} className="py-1.5 px-2.5 text-muted-foreground text-[11px] truncate max-w-[100px]">
                                {String(row[k] ?? 'NaN')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="p-0 overflow-hidden">
                  <div className="p-2.5 bg-emerald-500/10 border-b border-border text-xs font-semibold text-emerald-500">
                    Cleaned Proposed Values (Sample)
                  </div>
                  <div className="overflow-x-auto max-h-[220px]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-muted/20 text-muted-foreground sticky top-0">
                        <tr>
                          {Object.keys(previewData.preview_cleaned[0] || {}).slice(0, 5).map(k => (
                            <th key={k} className="py-1.5 px-2.5">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {previewData.preview_cleaned.slice(0, 8).map((row, idx) => (
                          <tr key={idx} className="hover:bg-emerald-500/5">
                            {Object.keys(row).slice(0, 5).map(k => {
                              const origVal = previewData.preview_original[idx]?.[k];
                              const cleanVal = row[k];
                              const isMod = String(origVal) !== String(cleanVal);
                              return (
                                <td key={k} className={`py-1.5 px-2.5 text-[11px] truncate max-w-[100px] ${isMod ? 'text-emerald-400 font-bold bg-emerald-500/10' : 'text-foreground'}`}>
                                  {String(cleanVal ?? '')}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between bg-card">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold"
              >
                Back to Dashboard
              </button>
              <button
                onClick={handleApplyCleaning}
                disabled={applying}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Apply Cleaning & Create New Dataset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: BEFORE & AFTER MODEL BENCHMARK                       */}
      {/* ============================================================ */}
      {activeModal === 'benchmark' && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <span>Chronological Forecasting Evaluation</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comparison between baseline raw dataset and cleaned dataset on identical chronological test periods.
                </p>
              </div>
              <button onClick={() => setActiveModal('none')} className="p-2 hover:bg-muted/50 rounded-xl text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {benchmarking && (
                <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-semibold">Fitting XGBoost model and computing chronological holdout metrics...</p>
                </div>
              )}

              {benchmarkResult && (
                <div className="space-y-6">
                  {/* Summary Verdict */}
                  <div className={`p-4 rounded-xl border ${benchmarkResult.is_statistically_improved ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                    <h4 className={`text-sm font-bold ${benchmarkResult.is_statistically_improved ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {benchmarkResult.is_statistically_improved ? 'Forecasting Accuracy Improved' : 'Forecasting Accuracy Neutral / Mild Variance'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {benchmarkResult.summary_verdict}
                    </p>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-muted/30 p-4 rounded-xl border border-border">
                      <div className="text-xs text-muted-foreground">WAPE</div>
                      <div className="text-lg font-bold text-foreground mt-1">{benchmarkResult.cleaned_metrics.wape}%</div>
                      <div className="text-xs text-emerald-500 font-semibold mt-0.5">
                        +{benchmarkResult.improvement.wape_improvement_pct}% lift
                      </div>
                    </div>

                    <div className="bg-muted/30 p-4 rounded-xl border border-border">
                      <div className="text-xs text-muted-foreground">RMSE</div>
                      <div className="text-lg font-bold text-foreground mt-1">{benchmarkResult.cleaned_metrics.rmse}</div>
                      <div className="text-xs text-emerald-500 font-semibold mt-0.5">
                        +{benchmarkResult.improvement.rmse_improvement_pct}% lift
                      </div>
                    </div>

                    <div className="bg-muted/30 p-4 rounded-xl border border-border">
                      <div className="text-xs text-muted-foreground">MAE</div>
                      <div className="text-lg font-bold text-foreground mt-1">{benchmarkResult.cleaned_metrics.mae}</div>
                      <div className="text-xs text-emerald-500 font-semibold mt-0.5">
                        +{benchmarkResult.improvement.mae_improvement_pct}% lift
                      </div>
                    </div>

                    <div className="bg-muted/30 p-4 rounded-xl border border-border">
                      <div className="text-xs text-muted-foreground">MAPE</div>
                      <div className="text-lg font-bold text-foreground mt-1">{benchmarkResult.cleaned_metrics.mape}%</div>
                      <div className="text-xs text-emerald-500 font-semibold mt-0.5">
                        +{benchmarkResult.improvement.mape_improvement_pct}% lift
                      </div>
                    </div>
                  </div>

                  {/* Forecast Line Chart Comparison */}
                  <div className="bg-card p-4 rounded-xl border border-border">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-3">Chronological Forecast Comparison (Holdout Test Horizon)</h4>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={benchmarkResult.forecast_comparison}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }} />
                          <Line type="monotone" dataKey="baseline_forecast" stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
                          <Line type="monotone" dataKey="cleaned_forecast" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end bg-card">
              <button
                onClick={() => setActiveModal('none')}
                className="px-5 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs"
              >
                Close Benchmark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
