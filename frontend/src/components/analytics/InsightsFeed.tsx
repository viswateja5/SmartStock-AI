import { memo } from "react";
import { TrendingUp, AlertTriangle, Sparkles, CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "../ui/Card";
import { Link } from "react-router-dom";

interface AlertItem {
  title: string;
  message: string;
  severity?: string;
}

interface InsightsFeedProps {
  alerts?: AlertItem[];
  datasetName?: string;
  categoryDistribution?: Array<{ category: string; value: number }>;
  datasetId?: number;
}

export const InsightsFeed = memo(function InsightsFeed({
  alerts = [],
  datasetName = "Active Dataset",
  categoryDistribution = [],
  datasetId
}: InsightsFeedProps) {
  const getSeverityStyles = (severity: string = 'low') => {
    switch (severity.toLowerCase()) {
      case 'high':
      case 'risk':
        return "bg-rose-500/10 border-rose-500/20 text-rose-500";
      case 'medium':
      case 'warning':
        return "bg-amber-500/10 border-amber-500/20 text-amber-500";
      default:
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-500";
    }
  };

  const getSeverityIcon = (severity: string = 'low') => {
    switch (severity.toLowerCase()) {
      case 'high':
      case 'risk':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'medium':
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <Card className="p-6 h-full flex flex-col justify-between backdrop-blur-2xl bg-card/60 border border-border/50 shadow-sm">
      <div>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Live Dataset Telemetry
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Real-time status for {datasetName}</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
            {alerts.length} Records
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {alerts.length === 0 ? (
            <div className="p-4 rounded-xl border border-border/50 bg-card/40 text-xs text-muted-foreground text-center">
              No active alerts. Dataset records are fully synchronized.
            </div>
          ) : (
            alerts.map((alert, idx) => (
              <div
                key={idx}
                className="rounded-xl p-3.5 border border-border/50 bg-card/40 hover:bg-card/70 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <div className={`p-1.5 rounded-lg shrink-0 ${getSeverityStyles(alert.severity)}`}>
                    {getSeverityIcon(alert.severity)}
                  </div>
                  <div>
                    <h4 className="font-medium text-xs text-foreground mb-0.5">{alert.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}

          {categoryDistribution.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Top Categories in Dataset
              </p>
              <div className="space-y-1.5">
                {categoryDistribution.slice(0, 4).map((cat) => (
                  <div key={cat.category} className="flex justify-between text-xs">
                    <span className="text-foreground">{cat.category}</span>
                    <span className="font-mono text-muted-foreground">{cat.value.toLocaleString()} units</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-border/50 mt-4">
        <Link
          to={datasetId ? `/forecast?dataset=${datasetId}` : "/forecast"}
          className="flex items-center justify-between w-full text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <span>Run ML Forecast on this Dataset</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Card>
  );
});
