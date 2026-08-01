import { useState } from 'react';
import { Card } from '../ui/Card';
import { Search } from 'lucide-react';

interface ForecastDataTableProps {
  dates: string[];
  values: number[];
  lower: number[];
  upper: number[];
}

export function ForecastDataTable({ dates, values, lower, upper }: ForecastDataTableProps) {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const rowsPerPage = 10;
  
  const filteredData = dates.map((date, i) => ({
    date,
    forecast: values[i],
    lower: lower[i],
    upper: upper[i]
  })).filter(row => row.date.includes(searchTerm));

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  return (
    <Card className="p-6 backdrop-blur-2xl bg-card/60 border border-border/50 shadow-xl flex flex-col h-[450px] overflow-hidden w-full min-w-0">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg">Forecast Data Export</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search dates..." 
            className="pl-9 pr-4 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-auto rounded-lg border border-border min-h-0">
        <table className="w-full text-sm text-left relative">
          <thead className="bg-muted/80 sticky top-0 backdrop-blur-md z-10 border-b border-border">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Forecast</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">95% Lower CI</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">95% Upper CI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredData.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map((row) => (
              <tr key={row.date} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">{row.date}</td>
                <td className="px-4 py-2 text-right font-medium text-primary bg-primary/5">{row.forecast.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{row.lower.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{row.upper.toFixed(2)}</td>
              </tr>
            ))}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No data found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="flex justify-between items-center mt-4 text-xs shrink-0">
         <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 disabled:opacity-30 border border-border rounded-lg hover:bg-muted transition-colors">Previous</button>
         <span className="text-muted-foreground">Page {page + 1} of {Math.max(1, totalPages)}</span>
         <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 disabled:opacity-30 border border-border rounded-lg hover:bg-muted transition-colors">Next</button>
      </div>
    </Card>
  );
}
