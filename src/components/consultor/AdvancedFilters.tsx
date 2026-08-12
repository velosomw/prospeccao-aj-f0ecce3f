import { useState } from "react";
import { X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdvancedFiltersProps {
  columns: { key: string; header: string | React.ReactNode }[];
  onFilterChange: (filters: Record<string, string>) => void;
  onClose: () => void;
}

export default function AdvancedFilters({ columns, onFilterChange, onClose }: AdvancedFiltersProps) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const handleInputChange = (key: string, value: string) => {
    const newFilters = { ...activeFilters, [key]: value };
    if (!value) delete newFilters[key];
    setActiveFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setActiveFilters({});
    onFilterChange({});
  };

  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <Search className="w-4 h-4" />
          <span>Filtros por Coluna</span>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearFilters}
            className="text-xs h-7 text-slate-500 hover:text-slate-900"
          >
            Limpar tudo
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {columns.filter(c => c.key !== 'acoes').map((col) => (
          <div key={col.key} className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {typeof col.header === 'string' ? col.header : col.key}
            </Label>
            <Input
              placeholder={`Filtrar ${typeof col.header === 'string' ? col.header.toLowerCase() : ''}...`}
              value={activeFilters[col.key] || ""}
              onChange={(e) => handleInputChange(col.key, e.target.value)}
              className="h-9 text-sm bg-white border-slate-200 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
