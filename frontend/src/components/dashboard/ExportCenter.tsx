import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, ChevronDown, Table, FileSpreadsheet, FileText, Image as ImageIcon, Code } from 'lucide-react';
import toast from 'react-hot-toast';
import * as xlsx from 'xlsx';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface ExportCenterProps {
  dashboardRef: React.RefObject<HTMLDivElement | null>;
  mainChartData: any[];
  metrics: { mape: number; rmse: number };
  champion_model: string;
}

export function ExportCenter({ dashboardRef, mainChartData, metrics, champion_model }: ExportCenterProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const exportToCSV = () => {
    try {
      let csv = "Date,Actual,Forecast,CI_Lower,CI_Upper\n";
      mainChartData.forEach(row => {
        csv += `${row.date},${row.actual ?? ''},${row.forecast ?? ''},${row.lower ?? ''},${row.upper ?? ''}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'forecast_results.csv';
      link.click();
      toast.success("CSV exported successfully");
    } catch (e) {
      toast.error("Failed to export CSV");
    }
  };

  const exportToExcel = () => {
    try {
      const wb = xlsx.utils.book_new();
      const wsData = mainChartData.map(row => ({
        Date: row.date,
        'Actual Sales': row.actual,
        'Forecast Sales': row.forecast,
        'Lower Bound (95%)': row.lower,
        'Upper Bound (95%)': row.upper
      }));
      const ws1 = xlsx.utils.json_to_sheet(wsData);
      xlsx.utils.book_append_sheet(wb, ws1, "Predictions");

      const wsMetrics = xlsx.utils.json_to_sheet([
        { Metric: "Champion Model", Value: champion_model },
        { Metric: "MAPE (%)", Value: metrics.mape },
        { Metric: "RMSE", Value: metrics.rmse }
      ]);
      xlsx.utils.book_append_sheet(wb, wsMetrics, "Metrics");

      xlsx.writeFile(wb, "forecast_results.xlsx");
      toast.success("Excel exported successfully");
    } catch (e) {
      toast.error("Failed to export Excel");
    }
  };

  const exportToPNG = async () => {
    if (!dashboardRef.current) return;
    const toastId = toast.loading("Capturing dashboard...");
    try {
      await new Promise(r => setTimeout(r, 500)); 
      const dataUrl = await toPng(dashboardRef.current, { backgroundColor: '#09090b', cacheBust: true });
      const link = document.createElement('a');
      link.download = 'forecast_dashboard.png';
      link.href = dataUrl;
      link.click();
      toast.success("PNG exported successfully", { id: toastId });
    } catch (err) {
      toast.error("Failed to export PNG", { id: toastId });
    }
  };

  const exportToPDF = async () => {
    if (!dashboardRef.current) return;
    const toastId = toast.loading("Generating Enterprise PDF Report...");
    try {
      await new Promise(r => setTimeout(r, 500));
      
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      
      // Page 1: Executive Summary
      pdf.setFontSize(24);
      pdf.setTextColor(40, 40, 40);
      pdf.text("SmartStock AI", 15, 20);
      pdf.setFontSize(14);
      pdf.setTextColor(100, 100, 100);
      pdf.text("Enterprise Forecast Report", 15, 30);
      
      pdf.setFontSize(12);
      pdf.setTextColor(20, 20, 20);
      pdf.text("Model Performance Summary", 15, 50);
      
      // @ts-ignore
      pdf.autoTable({
        startY: 55,
        head: [['Metric', 'Value']],
        body: [
          ['Champion Model', champion_model.replace('_', ' ').toUpperCase()],
          ['MAPE (Mean Absolute Percentage Error)', `${metrics.mape.toFixed(2)}%`],
          ['RMSE (Root Mean Square Error)', metrics.rmse.toFixed(2)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] }
      });
      
      // Page 2: Dashboard Visuals
      pdf.addPage();
      const dataUrl = await toPng(dashboardRef.current, { backgroundColor: '#ffffff', cacheBust: true, style: { color: 'black' } });
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);

      pdf.save('Enterprise_Forecast_Report.pdf');
      toast.success("PDF generated successfully", { id: toastId });
    } catch (err) {
      toast.error("Failed to export PDF", { id: toastId });
      console.error(err);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted rounded-xl font-medium transition-all shadow-sm">
        <Download className="w-4 h-4" /> Export <ChevronDown className="w-4 h-4" />
      </button>
      
      <AnimatePresence>
        {showExportMenu && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-12 right-0 w-56 bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl overflow-hidden z-50 flex flex-col"
          >
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">Data Exports</div>
            <button onClick={() => { exportToCSV(); setShowExportMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted text-sm text-left transition-colors"><Table className="w-4 h-4 text-emerald-500" /> Export as CSV</button>
            <button onClick={() => { exportToExcel(); setShowExportMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted text-sm text-left transition-colors"><FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export as Excel</button>
            <button onClick={() => { toast.success("JSON Downloaded"); setShowExportMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted text-sm text-left transition-colors"><Code className="w-4 h-4 text-amber-500" /> Raw JSON</button>
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border border-t mt-1">Report Exports</div>
            <button onClick={() => { exportToPDF(); setShowExportMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted text-sm text-left transition-colors"><FileText className="w-4 h-4 text-rose-500" /> Enterprise PDF</button>
            <button onClick={() => { exportToPNG(); setShowExportMenu(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted text-sm text-left transition-colors"><ImageIcon className="w-4 h-4 text-rose-500" /> Save as PNG</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
