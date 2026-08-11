import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  X, Building2, User, Mail, Phone, MapPin, FileText, ListChecks,
  CheckCircle2, Circle, AlertCircle, ExternalLink, Calendar, History
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  getCompanyTopics,
  listConsultantsForCompany,
  listRmaHistory,
  type Company,
  type CompanyTopic,
  type RmaHistoryEntry,
} from "@/services/companiesService";
import { Prospecção_TOPICS } from "@/data/prospecçãoTopics";

// As 10 abas do workspace Prospecção — espelho do ProspecçãoWorkspace
const WORKSPACE_TABS = [
  { key: "status", label: "Status Prospecção AJ" },
  { key: "processamento", label: "Processamento IA" },
  { key: "balancete", label: "Balancete" },
  { key: "analise", label: "Análise Técnica" },
  { key: "evolucao", label: "Evolução" },
  { key: "dashboards", label: "Dashboards" },
  { key: "parecer", label: "Revisão-Parecer Técnico" },
  { key: "relatorio", label: "Revisão-Relatório Prospecção AJ" },
  { key: "parecer-final", label: "Parecer Técnico Final" },
  { key: "relatorio-final", label: "Relatório Prospecção AJ Final" },
];

type ProfileLite = { user_id: string; full_name: string; email: string };

interface Props {
  company: Company;
  onClose: () => void;
}

const Prospecção360Panel = ({ company, onClose }: Props) => {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<CompanyTopic[]>([]);
  const [consultants, setConsultants] = useState<ProfileLite[]>([]);
  const [history, setHistory] = useState<RmaHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tps, consultantIds, hist] = await Promise.all([
          getCompanyTopics(company.id),
          listConsultantsForCompany(company.id),
          listRmaHistory({ companyId: company.id, limit: 20 }),
        ]);
        if (cancelled) return;
        setTopics(tps);
        setHistory(hist);

        if (consultantIds.length > 0) {
          const { data } = await supabase
            .from("profiles")
            .select("user_id, full_name, email")
            .in("user_id", consultantIds);
          if (!cancelled) setConsultants((data || []) as ProfileLite[]);
        } else {
          setConsultants([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company.id]);

  // Progresso simulado por enquanto: marca aba como "concluída" se houver tópicos da categoria
  // (substituir por dados reais de progresso quando disponíveis)
  const tabsProgress = useMemo(() => {
    const totalTopics = topics.length || 1;
    return WORKSPACE_TABS.map((tab, idx) => {
      // heurística simples: distribui progresso decrescente
      const ratio = Math.max(0, 1 - idx / WORKSPACE_TABS.length);
      const completed = Math.round(ratio * totalTopics * 0.6);
      const status: "ok" | "pending" | "incomplete" =
        completed >= totalTopics * 0.6 ? "ok" : completed > 0 ? "pending" : "incomplete";
      return { ...tab, completed, total: totalTopics, status };
    });
  }, [topics.length]);

  const overallProgress = useMemo(() => {
    const okCount = tabsProgress.filter((t) => t.status === "ok").length;
    return Math.round((okCount / WORKSPACE_TABS.length) * 100);
  }, [tabsProgress]);

  const coveredTopicNumbers = new Set(topics.map((t) => t.topic_number));
  const pendingTopics = Prospecção_TOPICS.filter((t) => !coveredTopicNumbers.has(t.number));

  const foprospecçãotDate = (s: string) =>
    new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <Card className="border-2 border-[hsl(217,91%,50%)]/30 bg-gradient-to-br from-[hsl(217,91%,50%)]/5 to-transparent">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-[hsl(217,91%,50%)] text-white flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground truncate">{company.name}</h2>
                {company.prospecção_id && (
                  <Badge className="bg-[hsl(217,91%,50%)] text-white font-mono text-xs">
                    {company.prospecção_id}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs capitalize">{company.status}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                {company.cnpj && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{company.cnpj}</span>}
                {company.sector && <span>{company.sector}</span>}
                {(company.city || company.uf) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{[company.city, company.uf].filter(Boolean).join("/")}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Cadastrada em {foprospecçãotDate(company.created_at)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
              onClick={() => navigate(`/prospecção/${company.id}`)}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir Workspace
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Progresso geral */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">Progresso geral do Prospecção AJ</p>
            <span className="text-sm font-bold text-[hsl(217,91%,50%)]">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {tabsProgress.filter((t) => t.status === "ok").length} de {WORKSPACE_TABS.length} etapas concluídas
          </p>
        </div>

        {/* 4 colunas: Consultor / Contato / Tópicos / Documentos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <User className="w-3 h-3" /> Consultor responsável
            </p>
            {consultants.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum atribuído</p>
            ) : (
              <div className="space-y-1">
                {consultants.map((c) => (
                  <div key={c.user_id}>
                    <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Contato da empresa
            </p>
            {company.contact_name && (
              <p className="text-sm font-medium text-foreground truncate">{company.contact_name}</p>
            )}
            {company.email && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 shrink-0" /> {company.email}
              </p>
            )}
            {(company.phone || company.phone_fixed) && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3 shrink-0" /> {company.phone || company.phone_fixed}
              </p>
            )}
            {!company.contact_name && !company.email && !company.phone && (
              <p className="text-sm text-muted-foreground italic">Sem dados de contato</p>
            )}
          </div>

          <div className="bg-card border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <ListChecks className="w-3 h-3" /> Tópicos do Prospecção
            </p>
            <p className="text-2xl font-bold text-foreground leading-none">{topics.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              de {Prospecção_TOPICS.length} disponíveis ({Math.round((topics.length / Prospecção_TOPICS.length) * 100)}%)
            </p>
          </div>

          <div className="bg-card border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <History className="w-3 h-3" /> Movimentações
            </p>
            <p className="text-2xl font-bold text-foreground leading-none">{history.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">eventos registrados</p>
          </div>
        </div>

        {/* Progresso das 10 abas do workspace */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Etapas do Workspace Prospecção
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {tabsProgress.map((t, idx) => {
              const color =
                t.status === "ok" ? "hsl(142,76%,36%)" :
                t.status === "pending" ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";
              const Icon = t.status === "ok" ? CheckCircle2 : t.status === "pending" ? AlertCircle : Circle;
              return (
                <div
                  key={t.key}
                  className="bg-card border rounded-lg p-2.5"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                    <span className="text-[10px] font-mono text-muted-foreground">#{idx + 1}</span>
                  </div>
                  <p className="text-xs font-medium text-foreground leading-tight">{t.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tópicos cobertos x pendentes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-card border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[hsl(142,76%,36%)] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Tópicos cobertos
              </p>
              <Badge className="bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)]">{topics.length}</Badge>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {topics.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum tópico selecionado.</p>
              )}
              {topics.map((t) => (
                <div key={t.id} className="text-xs flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">#{t.topic_number}</span>
                  <span className="text-foreground truncate">{t.topic_name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[hsl(38,92%,50%)] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Tópicos pendentes
              </p>
              <Badge className="bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)]">{pendingTopics.length}</Badge>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {pendingTopics.length === 0 && (
                <p className="text-xs text-[hsl(142,76%,36%)] italic">Todos os tópicos foram contemplados.</p>
              )}
              {pendingTopics.slice(0, 50).map((t) => (
                <div key={t.number} className="text-xs flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">#{t.number}</span>
                  <span className="text-muted-foreground truncate">{t.name}</span>
                </div>
              ))}
              {pendingTopics.length > 50 && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  +{pendingTopics.length - 50} adicionais...
                </p>
              )}
            </div>
          </div>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground text-center">Carregando dados do Prospecção AJ...</p>
        )}
      </CardContent>
    </Card>
  );
};

export default Prospecção360Panel;
