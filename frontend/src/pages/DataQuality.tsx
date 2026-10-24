import { useState, useEffect } from 'react';
import { 
  ShieldCheck, AlertTriangle, Sparkles, CheckCircle2, RefreshCw, 
  ArrowRight, Download, Play, Sliders, Database, Info, 
  TrendingUp, TrendingDown, Layers, FileText, Check, AlertOctagon, HelpCircle
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import api from '../lib/axios';
import toast from 'react-hot-toast';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  Tooltip, Legend, CartesianGrid, BarChart, Bar, Cell 
} from 'recharts';

// --- Type Definitions ---
interface AIRecommendation {
  recommended_missing_strategy: string;
  missing_reason: string;
  recommended_outlier_strategy: string;
  outlier_reason: string;
  expected_benefit: string;
  potential_risk: string;
  confidence: string;
  affected_records_count: number;
  forecasting_impact: string;
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
  recommendation: AIRecommendation;
}

interface DataQualityScoreBreakdown {
  overall_score: number;
  rating: string;
  missingness_score: number;
  outlier_score: number;
  duplicate_score: number;
  business_validity_score: number;
  schema_consistency_score: number;
  scoring_methodology: string;
}

interface BusinessRuleViolation {
  rule_name: string;
  column: string;
  violation_count: number;
  description: string;
  severity: string;
  sample_values: any[];
}

interface DataQualityProfileResponse {
  dataset_id: number;
  dataset_name: string;
  total_rows: number;
  total_columns: number;
  duplicate_rows_count: number;
  duplicate_percentage: number;
  invalid_dates_count: number;
  quality_score: DataQualityScoreBreakdown;
  columns: ColumnQualityProfile[];
  business_rule_violations: BusinessRuleViolation[];
  summary_recommendations: any[];
}

interface ColumnCleaningConfig {
  column_name: string;
  missing_strategy: string;
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
  column_audit: any[];
  preview_original: any[];
  preview_cleaned: any[];
}

interface ApplyCleaningResponse {
  status: string;
  original_dataset_id: number;
  cleaned_dataset_id: number;
  cleaned_dataset_name: string;
  rows_retained: number;
  rows_removed: number;
  values_imputed: number;
  outliers_treated: number;
  audit_report_url: string;
}

interface ModelComparisonResponse {
  model_type: string;
  horizon_days: number;
  baseline_metrics: Record<string, number>;
  cleaned_metrics: Record<string, number>;
  improvement: Record<string, number>;
  is_statistically_improved: boolean;
  summary_verdict: string;
  training_rows_baseline: number;
  training_rows_cleaned: number;
  values_imputed_count: number;
  outliers_treated_count: number;
  rows_removed_count: number;
  forecast_comparison: Array<{
    date: string;
    baseline_forecast: number;
    cleaned_forecast: number;
    difference: number;
  }>;
}

interface DatasetItem {
  id: number;
  name: string;
  original_filename: string;
  status: string;
  num_rows: number;
  num_columns: number;
}

export function DataQuality() {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [profile, setProfile] = useState<DataQualityProfileResponse | null>(null);
  const [configs, setConfigs] = useState<Record<string, ColumnCleaningConfig>>({});
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [dropLeakage, setDropLeakage] = useState(false);
  const [activeTab, setActiveTab] = useState<'health' | 'missing' | 'outliers' | 'preview' | 'benchmark' | 'export'>('health');

  // Loading states
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [profiling, setProfiling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);

  // Workflow output states
  const [previewResult, setPreviewResult] = useState<CleaningPreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyCleaningResponse | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<ModelComparisonResponse | null>(null);
  const [benchmarkModel, setBenchmarkModel] = useState<string>('xgboost');
  const [benchmarkHorizon, setBenchmarkHorizon] = useState<number>(14);

  // Fetch available datasets
  useEffect(() => {
    async function loadDatasets() {
      try {
        setLoadingDatasets(true);
        const res = await api.get('/quality/list-datasets');
        setDatasets(res.data);
        if (res.data.length > 0 && !selectedDatasetId) {
          // Select ready dataset
          const ready = res.data.find((d: DatasetItem) => d.status === 'ready') || res.data[0];
          setSelectedDatasetId(ready.id);
        }
      } catch (err: any) {
        console.error('Failed to load datasets', err);
        toast.error('Failed to load dataset list.');
      } finally {
        setLoadingDatasets(false);
      }
    }
    loadDatasets();
  }, []);

  // Fetch profile when dataset selection changes
  useEffect(() => {
    if (selectedDatasetId) {
      loadProfile(selectedDatasetId);
    }
  }, [selectedDatasetId]);

  const loadProfile = async (id: number) => {
    try {
      setProfiling(true);
      setPreviewResult(null);
      setApplyResult(null);
      setBenchmarkResult(null);
      const res = await api.get(`/quality/${id}/profile`);
      setProfile(res.data);

      // Initialize column configs from AI recommendations
      const initialConfigs: Record<string, ColumnCleaningConfig> = {};
      res.data.columns.forEach((col: ColumnQualityProfile) => {
        initialConfigs[col.name] = {
          column_name: col.name,
          missing_strategy: col.recommendation.recommended_missing_strategy,
          outlier_strategy: col.recommendation.recommended_outlier_strategy,
          iqr_multiplier: 1.5,
          percentile_lower: 1.0,
          percentile_upper: 99.0,
          group_by_column: undefined
        };
      });
      setConfigs(initialConfigs);
    } catch (err: any) {
      console.error('Profiling error', err);
      toast.error(err.response?.data?.detail || 'Failed to profile dataset.');
    } finally {
      setProfiling(false);
    }
  };

  const handleConfigChange = (colName: string, field: keyof ColumnCleaningConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [colName]: {
        ...prev[colName],
        [field]: value
      }
    }));
  };

  const applyAllAiRecommendations = () => {
    if (!profile) return;
    const recommended: Record<string, ColumnCleaningConfig> = {};
    profile.columns.forEach((col) => {
      recommended[col.name] = {
        column_name: col.name,
        missing_strategy: col.recommendation.recommended_missing_strategy,
        outlier_strategy: col.recommendation.recommended_outlier_strategy,
        iqr_multiplier: 1.5,
        percentile_lower: 1.0,
        percentile_upper: 99.0
      };
    });
    setConfigs(recommended);
    toast.success('Applied all AI recommended strategies across all columns!');
  };

  const runPreview = async () => {
    if (!selectedDatasetId || !profile) return;
    try {
      setPreviewing(true);
      const payload = {
        columns: Object.values(configs),
        remove_duplicates: removeDuplicates,
        drop_leakage_columns: dropLeakage
      };
      const res = await api.post(`/quality/${selectedDatasetId}/preview`, payload);
      setPreviewResult(res.data);
      setActiveTab('preview');
      toast.success('Cleaning dry-run preview updated!');
    } catch (err: any) {
      console.error('Preview failed', err);
      toast.error(err.response?.data?.detail || 'Preview generation failed.');
    } finally {
      setPreviewing(false);
    }
  };

  const executeApplyCleaning = async () => {
    if (!selectedDatasetId || !profile) return;
    try {
      setApplying(true);
      const payload = {
        columns: Object.values(configs),
        remove_duplicates: removeDuplicates,
        drop_leakage_columns: dropLeakage,
        cleaned_dataset_name: `Cleaned (${new Date().toLocaleDateString()}) - ${profile.dataset_name}`
      };
      const res = await api.post(`/quality/${selectedDatasetId}/apply`, payload);
      setApplyResult(res.data);
      toast.success(`Cleaned dataset created! (ID: ${res.data.cleaned_dataset_id})`);
      
      // Refresh datasets list
      const dsListRes = await api.get('/quality/list-datasets');
      setDatasets(dsListRes.data);
      
      // Automatically switch to Benchmark tab
      setActiveTab('benchmark');
    } catch (err: any) {
      console.error('Apply cleaning error', err);
      toast.error(err.response?.data?.detail || 'Failed to apply cleaning.');
    } finally {
      setApplying(false);
    }
  };

  const runBenchmark = async () => {
    if (!selectedDatasetId || !applyResult?.cleaned_dataset_id) {
      toast.error('Please apply cleaning to generate a cleaned dataset before running benchmark.');
      return;
    }
    try {
      setBenchmarking(true);
      const payload = {
        original_dataset_id: selectedDatasetId,
        cleaned_dataset_id: applyResult.cleaned_dataset_id,
        model_type: benchmarkModel,
        horizon: benchmarkHorizon
      };
      const res = await api.post('/quality/compare-models', payload);
      setBenchmarkResult(res.data);
      toast.success('Chronological model benchmark completed!');
    } catch (err: any) {
      console.error('Benchmark error', err);
      toast.error(err.response?.data?.detail || 'Model evaluation benchmark failed.');
    } finally {
      setBenchmarking(false);
    }
  };

  const downloadCleanedCsv = async (datasetId: number, filename: string) => {
    try {
      const response = await api.get(`/quality/${datasetId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Download initiated!');
    } catch (err) {
      toast.error('Download failed.');
    }
  };

  const downloadAuditReport = async (datasetId: number) => {
    try {
      const response = await api.get(`/quality/${datasetId}/report`);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `data_quality_audit_report_${datasetId}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Audit report downloaded!');
    } catch (err) {
      toast.error('Failed to download audit report.');
    }
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 75) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    if (score >= 60) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  const currentDataset = datasets.find(d => d.id === selectedDatasetId);

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card to-primary/5 p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-2 border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous ML Preprocessing & Validation</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Data Quality & Cleaning
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Profile statistical distributions, inspect explainable AI imputation and outlier recommendations, 
            preview cell transformations in a dry-run, and benchmark chronologically separated forecasting accuracy.
          </p>
        </div>

        {/* Dataset Selector Control */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-muted-foreground mb-1">Target Dataset</label>
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
              disabled={loadingDatasets || profiling}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-sm min-w-[240px]"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.num_rows ? `${d.num_rows.toLocaleString()} rows` : d.status})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => selectedDatasetId && loadProfile(selectedDatasetId)}
            disabled={profiling || !selectedDatasetId}
            className="mt-5 p-2.5 border border-border rounded-xl bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Re-run Quality Profiling"
          >
            <RefreshCw className={`w-4 h-4 ${profiling ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-2 text-sm font-medium">
        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'health' 
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Quality Score & Health</span>
          {profile && (
            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-white/20">
              {profile.quality_score.overall_score}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('missing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'missing' 
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Missing Values</span>
          {profile && profile.columns.some(c => c.missing_count > 0) && (
            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
              {profile.columns.filter(c => c.missing_count > 0).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('outliers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'outliers' 
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Outliers & Business Rules</span>
          {profile && (profile.business_rule_violations.length > 0 || profile.columns.some(c => c.outliers_count > 0)) && (
            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
              {profile.columns.filter(c => c.outliers_count > 0).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'preview' 
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Dry-Run Diff Preview</span>
          {previewResult && (
            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              Ready
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('benchmark')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'benchmark' 
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Before & After Benchmark</span>
          {benchmarkResult && (
            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              +{benchmarkResult.improvement.wape_improvement_pct}%
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'export' 
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Export & Audit Report</span>
        </button>
      </div>

      {/* Profiling Spinner */}
      {profiling && (
        <Card className="p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-primary/10 rounded-2xl animate-pulse">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Computing Multi-Dimensional Data Quality Profile</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Analyzing missingness distribution, running IQR/MAD outlier statistics, testing business constraints, and generating AI recommendations...
            </p>
          </div>
        </Card>
      )}

      {/* Profile Loaded View */}
      {!profiling && profile && (
        <div>
          {/* TAB 1: HEALTH AUDIT & SCORE */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              {/* Score Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Overall Gauge Card */}
                <Card className="p-5 flex flex-col items-center justify-center text-center bg-card border-border">
                  <div className={`w-24 h-24 rounded-full flex flex-col items-center justify-center border-4 ${getScoreBadgeColor(profile.quality_score.overall_score)}`}>
                    <span className="text-3xl font-extrabold">{profile.quality_score.overall_score}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider">/ 100</span>
                  </div>
                  <h4 className="font-semibold text-foreground mt-3">{profile.quality_score.rating} Quality</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Automated Multi-Factor Health Index</p>
                </Card>

                {/* Sub-Score Breakdown */}
                <Card className="p-5 col-span-1 md:col-span-3 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground flex items-center justify-between">
                      <span>Quality Dimensions Breakdown</span>
                      <span className="text-xs font-normal text-muted-foreground">Weighted composite scoring</span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                      <div className="bg-muted/40 p-3 rounded-xl border border-border/50">
                        <div className="text-xs text-muted-foreground">Missingness</div>
                        <div className="text-lg font-bold text-foreground mt-1">{profile.quality_score.missingness_score}</div>
                        <div className="text-[10px] text-muted-foreground">Weight: 25%</div>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border/50">
                        <div className="text-xs text-muted-foreground">Outlier Score</div>
                        <div className="text-lg font-bold text-foreground mt-1">{profile.quality_score.outlier_score}</div>
                        <div className="text-[10px] text-muted-foreground">Weight: 25%</div>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border/50">
                        <div className="text-xs text-muted-foreground">Duplicates</div>
                        <div className="text-lg font-bold text-foreground mt-1">{profile.quality_score.duplicate_score}</div>
                        <div className="text-[10px] text-muted-foreground">Weight: 15%</div>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border/50">
                        <div className="text-xs text-muted-foreground">Business Validity</div>
                        <div className="text-lg font-bold text-foreground mt-1">{profile.quality_score.business_validity_score}</div>
                        <div className="text-[10px] text-muted-foreground">Weight: 20%</div>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border/50">
                        <div className="text-xs text-muted-foreground">Schema Fidelity</div>
                        <div className="text-lg font-bold text-foreground mt-1">{profile.quality_score.schema_consistency_score}</div>
                        <div className="text-[10px] text-muted-foreground">Weight: 15%</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-primary" />
                      Rows: <strong className="text-foreground">{profile.total_rows.toLocaleString()}</strong> | Columns: <strong className="text-foreground">{profile.total_columns}</strong> | Duplicates: <strong className="text-foreground">{profile.duplicate_rows_count} ({profile.duplicate_percentage}%)</strong>
                    </span>
                    <button
                      onClick={applyAllAiRecommendations}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg font-medium transition-colors flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Apply AI Recommended Strategies
                    </button>
                  </div>
                </Card>
              </div>

              {/* Business Rule Violations Banner */}
              {profile.business_rule_violations.length > 0 && (
                <Card className="p-4 border-rose-500/30 bg-rose-500/5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-rose-500">
                        Domain Business Rule Violations Detected ({profile.business_rule_violations.length})
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        The dataset violates physical or financial constraints that distort forecasting models.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {profile.business_rule_violations.map((v, idx) => (
                          <div key={idx} className="bg-card/80 p-2.5 rounded-lg border border-border text-xs flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-foreground">{v.rule_name}</span>
                              <span className="text-muted-foreground ml-1.5">({v.column})</span>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 shrink-0">
                              {v.violation_count} rows
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Column Health Table */}
              <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Column Health & Leakage Audit</h3>
                    <p className="text-xs text-muted-foreground">Overview of completeness, statistical anomalies, and leakage hazards</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {profile.columns.length} columns inspected
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="py-3 px-4">Column</th>
                        <th className="py-3 px-3">Role & Type</th>
                        <th className="py-3 px-3">Missing Values</th>
                        <th className="py-3 px-3">Outliers</th>
                        <th className="py-3 px-3">Distribution</th>
                        <th className="py-3 px-3">Leakage Risk</th>
                        <th className="py-3 px-3">AI Recommendation</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {profile.columns.map((col) => (
                        <tr key={col.name} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {col.name}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-foreground">
                              {col.role}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">({col.type})</span>
                          </td>
                          <td className="py-3 px-3">
                            {col.missing_count > 0 ? (
                              <span className="text-amber-500 font-medium">
                                {col.missing_count.toLocaleString()} ({col.missing_percentage}%)
                              </span>
                            ) : (
                              <span className="text-emerald-500 flex items-center gap-1 font-medium">
                                <Check className="w-3.5 h-3.5" /> 0%
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {col.outliers_count > 0 ? (
                              <span className="text-rose-500 font-medium">
                                {col.outliers_count.toLocaleString()} ({col.outliers_percentage}%)
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-muted-foreground">
                            {col.min_value !== undefined && col.max_value !== undefined ? (
                              <span>
                                [{col.min_value} ... {col.max_value}]
                              </span>
                            ) : (
                              <span>{col.unique_count} distinct</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {col.leakage_risk ? (
                              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 font-semibold border border-rose-500/20 text-[10px]">
                                Target Leakage Hazard
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Safe</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-primary" />
                                {col.recommendation.recommended_missing_strategy} / {col.recommendation.recommended_outlier_strategy}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={col.recommendation.expected_benefit}>
                                {col.recommendation.expected_benefit}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                if (col.missing_count > 0) setActiveTab('missing');
                                else setActiveTab('outliers');
                              }}
                              className="text-primary hover:underline text-xs font-medium"
                            >
                              Configure
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Bottom Action Bar */}
              <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
                <div className="text-xs text-muted-foreground">
                  Ready to configure strategy? Choose missing value imputations or preview the transformations.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('missing')}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <span>Configure Strategies</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MISSING VALUES TREATMENT */}
          {activeTab === 'missing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Missing Value Imputation Strategy</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure tailored numerical, categorical, and target-specific imputation without introducing target leakage or temporal distortion.
                  </p>
                </div>
                <button
                  onClick={applyAllAiRecommendations}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Reset to AI Recommendations
                </button>
              </div>

              {/* Missing Value Columns Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile.columns.map((col) => {
                  const cfg = configs[col.name] || {
                    column_name: col.name,
                    missing_strategy: 'unchanged',
                    outlier_strategy: 'keep_unchanged',
                    iqr_multiplier: 1.5,
                    percentile_lower: 1.0,
                    percentile_upper: 99.0
                  };
                  const isNumeric = ['numerical', 'int64', 'float64'].some(t => col.type.includes(t) || col.role === 'numerical');
                  const isTarget = col.role === 'target' || col.name.toLowerCase().includes('units_sold');

                  return (
                    <Card key={col.name} className="p-4 space-y-3 border-border">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">{col.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                              {col.role}
                            </span>
                            {isTarget && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                Forecast Target
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Missing: <strong className={col.missing_count > 0 ? "text-amber-500" : "text-emerald-500"}>{col.missing_count} rows ({col.missing_percentage}%)</strong>
                          </div>
                        </div>

                        {/* Strategy Select */}
                        <div className="flex flex-col items-end">
                          <label className="text-[10px] font-medium text-muted-foreground mb-1">Selected Strategy</label>
                          <select
                            value={cfg.missing_strategy}
                            onChange={(e) => handleConfigChange(col.name, 'missing_strategy', e.target.value)}
                            className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="unchanged">Leave Unchanged</option>
                            {isNumeric ? (
                              <>
                                <option value="median">Median Imputation (Robust)</option>
                                <option value="mean">Mean Imputation</option>
                                <option value="forward_fill">Forward Fill (Time-Series)</option>
                                <option value="backward_fill">Backward Fill</option>
                                <option value="linear_interpolation">Linear Interpolation</option>
                                <option value="group_median">Group Median</option>
                                <option value="exclude_rows">Exclude Rows (Safe for Target)</option>
                              </>
                            ) : (
                              <>
                                <option value="mode">Most Frequent (Mode)</option>
                                <option value="missing_category">Explicit 'Unknown' Category</option>
                                <option value="forward_fill">Forward Fill</option>
                                <option value="exclude_rows">Exclude Rows</option>
                              </>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Group By selector if group_median chosen */}
                      {cfg.missing_strategy === 'group_median' && (
                        <div className="bg-muted/30 p-2.5 rounded-lg border border-border text-xs flex items-center justify-between">
                          <span className="text-muted-foreground">Group by Entity:</span>
                          <select
                            value={cfg.group_by_column || ''}
                            onChange={(e) => handleConfigChange(col.name, 'group_by_column', e.target.value)}
                            className="bg-card border border-border rounded px-2 py-0.5 text-xs text-foreground"
                          >
                            <option value="">Select column...</option>
                            {profile.columns.filter(c => c.name !== col.name).map(c => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* AI Recommendation Reasoning */}
                      <div className="bg-primary/5 border border-primary/15 rounded-lg p-2.5 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-primary font-semibold text-[11px]">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Recommendation: {col.recommendation.recommended_missing_strategy}</span>
                          <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded bg-primary/10">
                            Confidence: {col.recommendation.confidence}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {col.recommendation.missing_reason}
                        </p>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 pt-1 border-t border-primary/10">
                          <span>Benefit: <strong className="text-foreground">{col.recommendation.expected_benefit}</strong></span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
                <button
                  onClick={() => setActiveTab('health')}
                  className="px-4 py-2 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold"
                >
                  Back to Health
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('outliers')}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Proceed to Outliers</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OUTLIERS & BUSINESS RULES */}
          {activeTab === 'outliers' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Outlier Treatment & Physical Constraints</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mitigate extreme sensor glitches, data entry anomalies, and negative financial values using statistical thresholds (IQR, MAD, Z-Score).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Remove Duplicates:</label>
                  <input
                    type="checkbox"
                    checked={removeDuplicates}
                    onChange={(e) => setRemoveDuplicates(e.target.checked)}
                    className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                  />
                </div>
              </div>

              {/* Numerical Outlier Treatment Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile.columns.map((col) => {
                  const cfg = configs[col.name] || {
                    column_name: col.name,
                    missing_strategy: 'unchanged',
                    outlier_strategy: 'keep_unchanged',
                    iqr_multiplier: 1.5,
                    percentile_lower: 1.0,
                    percentile_upper: 99.0
                  };
                  const isNumeric = ['numerical', 'int64', 'float64'].some(t => col.type.includes(t) || col.role === 'numerical');

                  if (!isNumeric) return null;

                  return (
                    <Card key={col.name} className="p-4 space-y-3 border-border">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">{col.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                              {col.role}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Outliers (IQR 1.5×): <strong className={col.outliers_count > 0 ? "text-rose-500" : "text-emerald-500"}>{col.outliers_count} ({col.outliers_percentage}%)</strong>
                            {col.iqr && <span className="ml-2 text-[10px] text-muted-foreground">(IQR: {col.iqr})</span>}
                          </div>
                        </div>

                        {/* Strategy Select */}
                        <div className="flex flex-col items-end">
                          <label className="text-[10px] font-medium text-muted-foreground mb-1">Outlier Strategy</label>
                          <select
                            value={cfg.outlier_strategy}
                            onChange={(e) => handleConfigChange(col.name, 'outlier_strategy', e.target.value)}
                            className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="keep_unchanged">Keep Unchanged</option>
                            <option value="cap_iqr">Cap at IQR Boundary (Winsorize)</option>
                            <option value="cap_percentile">Cap at Percentile Bounds</option>
                            <option value="replace_median">Replace Outliers with Median</option>
                            <option value="remove_rows">Remove Rows</option>
                          </select>
                        </div>
                      </div>

                      {/* Config parameters */}
                      {cfg.outlier_strategy === 'cap_iqr' && (
                        <div className="bg-muted/30 p-2.5 rounded-lg border border-border text-xs flex items-center justify-between">
                          <span className="text-muted-foreground">IQR Multiplier (k):</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="1.0"
                              max="3.0"
                              value={cfg.iqr_multiplier}
                              onChange={(e) => handleConfigChange(col.name, 'iqr_multiplier', parseFloat(e.target.value))}
                              className="w-16 bg-card border border-border rounded px-2 py-0.5 text-xs text-foreground text-center"
                            />
                            <span className="text-[10px] text-muted-foreground">(Typical: 1.5)</span>
                          </div>
                        </div>
                      )}

                      {cfg.outlier_strategy === 'cap_percentile' && (
                        <div className="bg-muted/30 p-2.5 rounded-lg border border-border text-xs flex items-center justify-between">
                          <span className="text-muted-foreground">Percentiles:</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={cfg.percentile_lower}
                              onChange={(e) => handleConfigChange(col.name, 'percentile_lower', parseFloat(e.target.value))}
                              className="w-12 bg-card border border-border rounded px-1.5 py-0.5 text-xs text-foreground text-center"
                            />
                            <span>to</span>
                            <input
                              type="number"
                              value={cfg.percentile_upper}
                              onChange={(e) => handleConfigChange(col.name, 'percentile_upper', parseFloat(e.target.value))}
                              className="w-12 bg-card border border-border rounded px-1.5 py-0.5 text-xs text-foreground text-center"
                            />
                            <span className="text-[10px] text-muted-foreground">(e.g., 1st - 99th)</span>
                          </div>
                        </div>
                      )}

                      {/* AI recommendation reasoning */}
                      <div className="bg-primary/5 border border-primary/15 rounded-lg p-2.5 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-primary font-semibold text-[11px]">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Recommendation: {col.recommendation.recommended_outlier_strategy}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {col.recommendation.outlier_reason}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
                <button
                  onClick={() => setActiveTab('missing')}
                  className="px-4 py-2 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold"
                >
                  Back to Missing Values
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={runPreview}
                    disabled={previewing}
                    className="px-5 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {previewing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                    <span>Run Dry-Run Preview</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DRY-RUN DIFF PREVIEW & APPLY */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Dry-Run Transformation Preview</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verify simulated imputations and outlier caps before persisting. The original dataset is never modified.
                  </p>
                </div>
                <button
                  onClick={runPreview}
                  disabled={previewing}
                  className="px-3 py-1.5 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${previewing ? 'animate-spin text-primary' : ''}`} />
                  Re-run Preview
                </button>
              </div>

              {previewResult && (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="p-4 bg-card border-border">
                      <div className="text-xs text-muted-foreground">Original vs Retained Rows</div>
                      <div className="text-lg font-bold text-foreground mt-1">
                        {previewResult.cleaned_rows_count.toLocaleString()} / {previewResult.original_rows_count.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {previewResult.rows_removed} rows removed
                      </div>
                    </Card>

                    <Card className="p-4 bg-card border-border">
                      <div className="text-xs text-muted-foreground">Values Imputed</div>
                      <div className="text-lg font-bold text-emerald-500 mt-1">
                        {previewResult.total_values_imputed.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Across missing cells
                      </div>
                    </Card>

                    <Card className="p-4 bg-card border-border">
                      <div className="text-xs text-muted-foreground">Outliers Treated</div>
                      <div className="text-lg font-bold text-primary mt-1">
                        {previewResult.total_outliers_treated.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Capped or replaced
                      </div>
                    </Card>

                    <Card className="p-4 bg-card border-border flex flex-col justify-between">
                      <div className="text-xs text-muted-foreground">Cleaned Dataset Status</div>
                      <div className="text-sm font-semibold text-foreground mt-1">
                        {applyResult ? "Persisted in Workspace" : "Ready to Persist"}
                      </div>
                      <button
                        onClick={executeApplyCleaning}
                        disabled={applying}
                        className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 transition-colors"
                      >
                        {applying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Apply & Create Dataset</span>
                      </button>
                    </Card>
                  </div>

                  {/* Transformation Audit by Column */}
                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h4 className="text-sm font-semibold text-foreground">Transformation Strategy Summary</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4">Column</th>
                            <th className="py-2.5 px-3">Missing Strategy</th>
                            <th className="py-2.5 px-3">Outlier Strategy</th>
                            <th className="py-2.5 px-3">Values Imputed</th>
                            <th className="py-2.5 px-3">Outliers Treated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {previewResult.column_audit.map((audit) => (
                            <tr key={audit.column_name} className="hover:bg-muted/20">
                              <td className="py-2.5 px-4 font-semibold text-foreground">{audit.column_name}</td>
                              <td className="py-2.5 px-3 text-muted-foreground">{audit.missing_strategy}</td>
                              <td className="py-2.5 px-3 text-muted-foreground">{audit.outlier_strategy}</td>
                              <td className="py-2.5 px-3 font-semibold text-emerald-500">{audit.values_imputed}</td>
                              <td className="py-2.5 px-3 font-semibold text-primary">{audit.outliers_treated}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* Side-by-Side Data Diff Preview */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Original Preview */}
                    <Card className="p-0 overflow-hidden">
                      <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Original Data (Sample Rows)</span>
                        <span className="text-[10px] text-muted-foreground">Unmodified</span>
                      </div>
                      <div className="overflow-x-auto max-h-[300px]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                            <tr>
                              {Object.keys(previewResult.preview_original[0] || {}).slice(0, 6).map((k) => (
                                <th key={k} className="py-2 px-3">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {previewResult.preview_original.map((row, idx) => (
                              <tr key={idx} className="hover:bg-muted/10">
                                {Object.keys(row).slice(0, 6).map((k) => (
                                  <td key={k} className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                                    {String(row[k] ?? 'NaN')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    {/* Cleaned Preview */}
                    <Card className="p-0 overflow-hidden">
                      <div className="p-3 border-b border-border bg-emerald-500/10 flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-500">Cleaned Data (Simulated Preview)</span>
                        <span className="text-[10px] text-emerald-500">Transformed</span>
                      </div>
                      <div className="overflow-x-auto max-h-[300px]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                            <tr>
                              {Object.keys(previewResult.preview_cleaned[0] || {}).slice(0, 6).map((k) => (
                                <th key={k} className="py-2 px-3">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {previewResult.preview_cleaned.map((row, idx) => (
                              <tr key={idx} className="hover:bg-emerald-500/5">
                                {Object.keys(row).slice(0, 6).map((k) => {
                                  const origVal = previewResult.preview_original[idx]?.[k];
                                  const cleanVal = row[k];
                                  const isModified = String(origVal) !== String(cleanVal);
                                  return (
                                    <td key={k} className={`py-2 px-3 font-mono text-[11px] ${isModified ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-foreground'}`}>
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
                </>
              )}

              {/* Bottom Actions */}
              <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
                <button
                  onClick={() => setActiveTab('outliers')}
                  className="px-4 py-2 border border-border hover:bg-muted/50 rounded-xl text-xs font-semibold"
                >
                  Back to Outliers
                </button>
                <button
                  onClick={executeApplyCleaning}
                  disabled={applying || !previewResult}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-colors"
                >
                  {applying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Apply Transformations & Save Dataset</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: BEFORE & AFTER MODEL BENCHMARK */}
          {activeTab === 'benchmark' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">Chronological Forecasting Model Benchmark</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Evaluates baseline raw vs cleaned dataset on identical chronological validation periods without synthetic test leakage.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Model:</label>
                    <select
                      value={benchmarkModel}
                      onChange={(e) => setBenchmarkModel(e.target.value)}
                      className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      <option value="xgboost">XGBoost Champion</option>
                      <option value="lightgbm">LightGBM</option>
                      <option value="random_forest">Random Forest</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Horizon:</label>
                    <select
                      value={benchmarkHorizon}
                      onChange={(e) => setBenchmarkHorizon(Number(e.target.value))}
                      className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>

                  <button
                    onClick={runBenchmark}
                    disabled={benchmarking || !applyResult}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {benchmarking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>Run Evaluation</span>
                  </button>
                </div>
              </div>

              {!applyResult && (
                <Card className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                  <h4 className="text-sm font-semibold text-foreground">Cleaned Dataset Not Yet Applied</h4>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Please configure strategies and click "Apply Transformations & Save Dataset" in the Preview tab first so the benchmark has a saved cleaned dataset to compare.
                  </p>
                  <button
                    onClick={() => setActiveTab('preview')}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl"
                  >
                    Go to Preview & Apply
                  </button>
                </Card>
              )}

              {benchmarking && (
                <Card className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  <h4 className="text-sm font-semibold text-foreground">Training & Evaluating Models Chronologically...</h4>
                  <p className="text-xs text-muted-foreground">
                    Fitting {benchmarkModel} on raw baseline and cleaned datasets across matching chronological test windows...
                  </p>
                </Card>
              )}

              {benchmarkResult && (
                <div className="space-y-6">
                  {/* Verdict Banner */}
                  <Card className={`p-4 border ${benchmarkResult.is_statistically_improved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${benchmarkResult.is_statistically_improved ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'} shrink-0`}>
                        {benchmarkResult.is_statistically_improved ? <TrendingUp className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className={`text-sm font-semibold ${benchmarkResult.is_statistically_improved ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {benchmarkResult.is_statistically_improved ? 'Statistically Validated Accuracy Improvement' : 'Accuracy Neutral / Slight Variance'}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {benchmarkResult.summary_verdict}
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* Side-by-side Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* WAPE */}
                    <Card className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">WAPE</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${benchmarkResult.improvement.wape_improvement_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {benchmarkResult.improvement.wape_improvement_pct >= 0 ? `+${benchmarkResult.improvement.wape_improvement_pct}%` : `${benchmarkResult.improvement.wape_improvement_pct}%`}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-lg font-bold text-foreground">{benchmarkResult.cleaned_metrics.wape}%</span>
                        <span className="text-xs text-muted-foreground line-through">{benchmarkResult.baseline_metrics.wape}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Weighted Absolute Error</div>
                    </Card>

                    {/* RMSE */}
                    <Card className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">RMSE</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${benchmarkResult.improvement.rmse_improvement_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {benchmarkResult.improvement.rmse_improvement_pct >= 0 ? `+${benchmarkResult.improvement.rmse_improvement_pct}%` : `${benchmarkResult.improvement.rmse_improvement_pct}%`}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-lg font-bold text-foreground">{benchmarkResult.cleaned_metrics.rmse}</span>
                        <span className="text-xs text-muted-foreground line-through">{benchmarkResult.baseline_metrics.rmse}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Root Mean Squared Error</div>
                    </Card>

                    {/* MAE */}
                    <Card className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">MAE</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${benchmarkResult.improvement.mae_improvement_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {benchmarkResult.improvement.mae_improvement_pct >= 0 ? `+${benchmarkResult.improvement.mae_improvement_pct}%` : `${benchmarkResult.improvement.mae_improvement_pct}%`}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-lg font-bold text-foreground">{benchmarkResult.cleaned_metrics.mae}</span>
                        <span className="text-xs text-muted-foreground line-through">{benchmarkResult.baseline_metrics.mae}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Mean Absolute Error</div>
                    </Card>

                    {/* MAPE */}
                    <Card className="p-4 bg-card border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">MAPE</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${benchmarkResult.improvement.mape_improvement_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {benchmarkResult.improvement.mape_improvement_pct >= 0 ? `+${benchmarkResult.improvement.mape_improvement_pct}%` : `${benchmarkResult.improvement.mape_improvement_pct}%`}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-lg font-bold text-foreground">{benchmarkResult.cleaned_metrics.mape}%</span>
                        <span className="text-xs text-muted-foreground line-through">{benchmarkResult.baseline_metrics.mape}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Percentage Error</div>
                    </Card>
                  </div>

                  {/* Forecast Line Chart Comparison */}
                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Chronological Forecast Comparison (Holdout Test Horizon)</h4>
                        <p className="text-xs text-muted-foreground">Baseline model projection vs cleaned dataset model projection</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-0.5 bg-gray-400 inline-block"></span> Baseline Model
                        </span>
                        <span className="flex items-center gap-1.5 font-semibold text-primary">
                          <span className="w-3 h-1 bg-primary inline-block rounded"></span> Cleaned Pipeline
                        </span>
                      </div>
                    </div>

                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={benchmarkResult.forecast_comparison}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="baseline_forecast" 
                            name="Baseline Forecast" 
                            stroke="#9ca3af" 
                            strokeWidth={2} 
                            strokeDasharray="4 4"
                            dot={{ r: 3 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="cleaned_forecast" 
                            name="Cleaned Pipeline Forecast" 
                            stroke="#6366f1" 
                            strokeWidth={2.5}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: EXPORT & AUDIT REPORT */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-foreground">Export Cleaned Dataset & Audit Documentation</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Download the sanitized dataset and regulatory compliance audit documentation for traceability.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Download Cleaned CSV Card */}
                <Card className="p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl w-fit mb-3">
                      <Database className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-semibold text-foreground">Cleaned Dataset (CSV)</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Complete preprocessed dataset with resolved missingness, stabilized outliers, and validated business ranges. 
                      Registered directly into your workspace.
                    </p>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border">
                    {applyResult ? (
                      <button
                        onClick={() => downloadCleanedCsv(applyResult.cleaned_dataset_id, applyResult.cleaned_dataset_name)}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Cleaned CSV</span>
                      </button>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        Please apply cleaning transformations in the Preview tab to generate the cleaned file.
                      </div>
                    )}
                  </div>
                </Card>

                {/* Download Audit Report JSON Card */}
                <Card className="p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="p-3 bg-primary/10 text-primary rounded-xl w-fit mb-3">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-semibold text-foreground">Data Quality & Compliance Audit (JSON)</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Complete machine-readable audit report containing original vs cleaned row counts, exact cell-level imputation counts, 
                      applied outlier thresholds, and chronological model evaluation deltas.
                    </p>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border">
                    {applyResult ? (
                      <button
                        onClick={() => downloadAuditReport(applyResult.cleaned_dataset_id)}
                        className="w-full py-2.5 border border-border hover:bg-muted/50 text-foreground font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Audit JSON</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => selectedDatasetId && downloadAuditReport(selectedDatasetId)}
                        className="w-full py-2.5 border border-border hover:bg-muted/50 text-foreground font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Profile Audit JSON</span>
                      </button>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

