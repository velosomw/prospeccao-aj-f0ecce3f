import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Loader2, FileSearch, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SimilarResult {
  id: string;
  document_id: string | null;
  prospeccao_id: string | null;
  classe: string | null;
  text: string;
  similarity: number;
}

const CLASSES = [
  { value: "__all__", label: "Todas as classes" },
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "Boleto" },
  { value: "BALANCETE", label: "Balancete" },
  { value: "DRE", label: "DRE" },
  { value: "BALANCO", label: "Balanço" },
  { value: "NOTA_FISCAL", label: "Nota Fiscal" },
  { value: "EXTRATO", label: "Extrato Bancário" },
  { value: "CONTRATO", label: "Contrato" },
];

export default function GestorIABuscaSemantica() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [classe, setClasse] = useState("__all__");
  const [prospeccaoId, setRmaId] = useState("");
  const [threshold, setThreshold] = useState(0.7);
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SimilarResult[]>([]);
  const [embeddingDims, setEmbeddingDims] = useState<number | null>(null);

  const handleSearch = async () => {
    if (!text.trim()) {
      toast.error("Digite um texto para buscar");
      return;
    }
    setLoading(true);
    setResults([]);
    setEmbeddingDims(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search-similar", {
        body: {
          text: text.trim(),
          classe: classe === "__all__" ? undefined : classe,
          prospeccao_id: prospeccaoId.trim() || undefined,
          threshold,
          limit,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data?.results ?? []);
      setEmbeddingDims(data?.embedding_dims ?? null);
      if (!data?.results?.length) {
        toast.info("Nenhum documento similar encontrado. Tente reduzir o threshold.");
      } else {
        toast.success(`${data.results.length} documento(s) similar(es) encontrado(s)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const simBadge = (s: number) => {
    const pct = Math.round(s * 100);
    if (s >= 0.85) return <Badge className="bg-green-600 hover:bg-green-700">{pct}%</Badge>;
    if (s >= 0.7) return <Badge className="bg-amber-500 hover:bg-amber-600">{pct}%</Badge>;
    return <Badge variant="secondary">{pct}%</Badge>;
  };

  return (
    <PlatformLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 bg-primary hover:bg-primary/90"
            onClick={() => navigate("/gestor-ia")}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4 text-primary-foreground" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Busca Semântica de Documentos OCR
            </h1>
            <p className="text-sm text-muted-foreground">
              Encontre documentos similares via embeddings Vertex AI (768D) — busca por significado, não por palavras-chave.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> Consulta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="query">Texto da consulta</Label>
              <Textarea
                id="query"
                placeholder='Ex.: "Pix realizado no valor de R$ 10.000 para fornecedor X"'
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Classe</Label>
                <Select value={classe} onValueChange={setClasse}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prospeccao">Prospecção AJ ID (opcional)</Label>
                <Input
                  id="prospeccao"
                  placeholder="ex.: Prospecção AJ-2025-001"
                  value={prospeccaoId}
                  onChange={(e) => setRmaId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="threshold">Threshold ({threshold.toFixed(2)})</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="limit">Top K</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSearch} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar Similares
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileSearch className="h-4 w-4" />
                Resultados {results.length > 0 && `(${results.length})`}
              </span>
              {embeddingDims && (
                <Badge variant="outline" className="font-mono text-xs">
                  embedding: {embeddingDims}D
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Gerando embedding e buscando...
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum resultado ainda. Faça uma consulta acima.
              </div>
            )}
            {!loading && results.length > 0 && (
              <div className="space-y-3">
                {results.map((r, i) => (
                  <div
                    key={r.id}
                    className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono">#{i + 1}</Badge>
                        {r.classe && <Badge variant="secondary">{r.classe}</Badge>}
                        {r.prospeccao_id && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {r.prospeccao_id}
                          </Badge>
                        )}
                      </div>
                      {simBadge(r.similarity)}
                    </div>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-6">
                      {r.text}
                    </p>
                    {r.document_id && (
                      <p className="text-xs text-muted-foreground mt-2 font-mono">
                        doc: {r.document_id}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformLayout>
  );
}
