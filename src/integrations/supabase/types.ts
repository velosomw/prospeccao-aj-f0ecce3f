export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_mapping_cache: {
        Row: {
          company_id: string
          confianca: number
          conta: string
          created_at: string
          descricao_normalizada: string
          descricao_padronizada: string
          hits: number
          id: string
          last_used_at: string
          source: string
          updated_at: string
        }
        Insert: {
          company_id: string
          confianca?: number
          conta: string
          created_at?: string
          descricao_normalizada: string
          descricao_padronizada: string
          hits?: number
          id?: string
          last_used_at?: string
          source?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          confianca?: number
          conta?: string
          created_at?: string
          descricao_normalizada?: string
          descricao_padronizada?: string
          hits?: number
          id?: string
          last_used_at?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      admjudicial_recuperandas: {
        Row: {
          admjudicial_user_id: string
          created_at: string
          created_by: string | null
          id: string
          recuperanda_user_id: string
        }
        Insert: {
          admjudicial_user_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          recuperanda_user_id: string
        }
        Update: {
          admjudicial_user_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recuperanda_user_id?: string
        }
        Relationships: []
      }
      agent_profiles: {
        Row: {
          agent_name: string
          created_at: string
          last_validated_at: string | null
          max_examples: number
          max_tokens: number
          notes: string | null
          priority_model: string
          quality_score: number
          require_validation: boolean
          similarity_threshold: number
          strict_mode: boolean
          temperature: number
          updated_at: string
          use_path_context: boolean
          use_structured_context: boolean
          validation_count: number
        }
        Insert: {
          agent_name: string
          created_at?: string
          last_validated_at?: string | null
          max_examples?: number
          max_tokens?: number
          notes?: string | null
          priority_model?: string
          quality_score?: number
          require_validation?: boolean
          similarity_threshold?: number
          strict_mode?: boolean
          temperature?: number
          updated_at?: string
          use_path_context?: boolean
          use_structured_context?: boolean
          validation_count?: number
        }
        Update: {
          agent_name?: string
          created_at?: string
          last_validated_at?: string | null
          max_examples?: number
          max_tokens?: number
          notes?: string | null
          priority_model?: string
          quality_score?: number
          require_validation?: boolean
          similarity_threshold?: number
          strict_mode?: boolean
          temperature?: number
          updated_at?: string
          use_path_context?: boolean
          use_structured_context?: boolean
          validation_count?: number
        }
        Relationships: []
      }
      ai_cost_circuit_breaker: {
        Row: {
          daily_usd_limit: number
          enabled: boolean
          hourly_usd_limit: number
          id: number
          last_trip_at: string | null
          last_trip_reason: string | null
          pause_until: string | null
          updated_at: string
        }
        Insert: {
          daily_usd_limit?: number
          enabled?: boolean
          hourly_usd_limit?: number
          id?: number
          last_trip_at?: string | null
          last_trip_reason?: string | null
          pause_until?: string | null
          updated_at?: string
        }
        Update: {
          daily_usd_limit?: number
          enabled?: boolean
          hourly_usd_limit?: number
          id?: number
          last_trip_at?: string | null
          last_trip_reason?: string | null
          pause_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_cost_config: {
        Row: {
          active: boolean | null
          cost_fixed: number
          cost_per_1k_input: number
          cost_per_1k_output: number
          cost_per_page: number
          cost_per_request: number
          currency: string | null
          id: string
          label: string
          notes: string | null
          provider: string
          service: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          cost_fixed?: number
          cost_per_1k_input?: number
          cost_per_1k_output?: number
          cost_per_page?: number
          cost_per_request?: number
          currency?: string | null
          id?: string
          label: string
          notes?: string | null
          provider: string
          service: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          cost_fixed?: number
          cost_per_1k_input?: number
          cost_per_1k_output?: number
          cost_per_page?: number
          cost_per_request?: number
          currency?: string | null
          id?: string
          label?: string
          notes?: string | null
          provider?: string
          service?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_extractions: {
        Row: {
          agent: string | null
          ai_confidence: number | null
          auto_retry_count: number
          chunks_processed: number | null
          chunks_total: number | null
          classe: string | null
          corrections: Json | null
          created_at: string
          created_by: string | null
          document_id: string | null
          duration_ms: number | null
          error_message: string | null
          extracted_data: Json | null
          final_confidence: number | null
          id: string
          normalized_text: string | null
          ocr_confidence: number | null
          partial_results: Json | null
          path: string | null
          progress: number
          quality_action: string | null
          quality_score: number | null
          raw_text: string | null
          rma_id: string | null
          source: string
          status: string
          updated_at: string
          valid: boolean | null
          validation: Json | null
          validation_score: number | null
        }
        Insert: {
          agent?: string | null
          ai_confidence?: number | null
          auto_retry_count?: number
          chunks_processed?: number | null
          chunks_total?: number | null
          classe?: string | null
          corrections?: Json | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          extracted_data?: Json | null
          final_confidence?: number | null
          id?: string
          normalized_text?: string | null
          ocr_confidence?: number | null
          partial_results?: Json | null
          path?: string | null
          progress?: number
          quality_action?: string | null
          quality_score?: number | null
          raw_text?: string | null
          rma_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          valid?: boolean | null
          validation?: Json | null
          validation_score?: number | null
        }
        Update: {
          agent?: string | null
          ai_confidence?: number | null
          auto_retry_count?: number
          chunks_processed?: number | null
          chunks_total?: number | null
          classe?: string | null
          corrections?: Json | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          extracted_data?: Json | null
          final_confidence?: number | null
          id?: string
          normalized_text?: string | null
          ocr_confidence?: number | null
          partial_results?: Json | null
          path?: string | null
          progress?: number
          quality_action?: string | null
          quality_score?: number | null
          raw_text?: string | null
          rma_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          valid?: boolean | null
          validation?: Json | null
          validation_score?: number | null
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          cost_calculated: number | null
          created_at: string | null
          created_by: string | null
          document_id: string | null
          id: string
          metadata: Json | null
          pages: number | null
          provider: string
          requests: number | null
          service: string
          tokens_input: number | null
          tokens_output: number | null
          type: string
        }
        Insert: {
          cost_calculated?: number | null
          created_at?: string | null
          created_by?: string | null
          document_id?: string | null
          id?: string
          metadata?: Json | null
          pages?: number | null
          provider: string
          requests?: number | null
          service: string
          tokens_input?: number | null
          tokens_output?: number | null
          type: string
        }
        Update: {
          cost_calculated?: number | null
          created_at?: string | null
          created_by?: string | null
          document_id?: string | null
          id?: string
          metadata?: Json | null
          pages?: number | null
          provider?: string
          requests?: number | null
          service?: string
          tokens_input?: number | null
          tokens_output?: number | null
          type?: string
        }
        Relationships: []
      }
      balancete_conflict_audit: {
        Row: {
          action: string
          company_id: string | null
          conflict_id: string
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          to_status: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          conflict_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          to_status?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          conflict_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          to_status?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balancete_conflict_audit_conflict_id_fkey"
            columns: ["conflict_id"]
            isOneToOne: false
            referencedRelation: "balancete_conflicts"
            referencedColumns: ["id"]
          },
        ]
      }
      balancete_conflicts: {
        Row: {
          ano: number
          company_id: string
          confianca_vencedor: number | null
          conta: string
          created_at: string
          descricao: string | null
          diferenca_max: number
          id: string
          mes: number
          origem_vencedor: string | null
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rma_id: string | null
          status: string
          updated_at: string
          valor_vencedor: number | null
          valores: Json
        }
        Insert: {
          ano: number
          company_id: string
          confianca_vencedor?: number | null
          conta: string
          created_at?: string
          descricao?: string | null
          diferenca_max?: number
          id?: string
          mes: number
          origem_vencedor?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rma_id?: string | null
          status?: string
          updated_at?: string
          valor_vencedor?: number | null
          valores?: Json
        }
        Update: {
          ano?: number
          company_id?: string
          confianca_vencedor?: number | null
          conta?: string
          created_at?: string
          descricao?: string | null
          diferenca_max?: number
          id?: string
          mes?: number
          origem_vencedor?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rma_id?: string | null
          status?: string
          updated_at?: string
          valor_vencedor?: number | null
          valores?: Json
        }
        Relationships: []
      }
      balancete_consolidado: {
        Row: {
          ano: number
          codigo: string | null
          company_id: string
          confianca_global: number | null
          conta: string
          created_at: string
          credito: number
          debito: number
          descricao: string
          grupo: string | null
          id: string
          mes: number
          nivel: number
          origem_lancamento_ids: string[] | null
          qtd_lancamentos: number
          reconciled: boolean
          reconciliation_notes: Json | null
          run_id: string | null
          saldo: number
          subgrupo: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          ano: number
          codigo?: string | null
          company_id: string
          confianca_global?: number | null
          conta: string
          created_at?: string
          credito?: number
          debito?: number
          descricao: string
          grupo?: string | null
          id?: string
          mes: number
          nivel: number
          origem_lancamento_ids?: string[] | null
          qtd_lancamentos?: number
          reconciled?: boolean
          reconciliation_notes?: Json | null
          run_id?: string | null
          saldo?: number
          subgrupo?: string | null
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          ano?: number
          codigo?: string | null
          company_id?: string
          confianca_global?: number | null
          conta?: string
          created_at?: string
          credito?: number
          debito?: number
          descricao?: string
          grupo?: string | null
          id?: string
          mes?: number
          nivel?: number
          origem_lancamento_ids?: string[] | null
          qtd_lancamentos?: number
          reconciled?: boolean
          reconciliation_notes?: Json | null
          run_id?: string | null
          saldo?: number
          subgrupo?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      balancete_periods: {
        Row: {
          ano: number
          company_id: string
          confianca_media: number | null
          conflitos_pendentes: number
          created_at: string
          id: string
          mes: number
          rma_id: string | null
          status: string
          timeline: Json
          total_contas: number
          total_documentos: number
          total_lancamentos: number
          ultima_carga_at: string | null
          ultimo_run_id: string | null
          updated_at: string
        }
        Insert: {
          ano: number
          company_id: string
          confianca_media?: number | null
          conflitos_pendentes?: number
          created_at?: string
          id?: string
          mes: number
          rma_id?: string | null
          status?: string
          timeline?: Json
          total_contas?: number
          total_documentos?: number
          total_lancamentos?: number
          ultima_carga_at?: string | null
          ultimo_run_id?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number
          company_id?: string
          confianca_media?: number | null
          conflitos_pendentes?: number
          created_at?: string
          id?: string
          mes?: number
          rma_id?: string | null
          status?: string
          timeline?: Json
          total_contas?: number
          total_documentos?: number
          total_lancamentos?: number
          ultima_carga_at?: string | null
          ultimo_run_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      balancete_runs: {
        Row: {
          alerts: Json | null
          ano: number
          company_id: string
          cost_total: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          files_processed: number | null
          files_skipped: number | null
          files_total: number | null
          finished_at: string | null
          folders_processed: number | null
          folders_total: number | null
          id: string
          lancamentos_criados: number | null
          log: Json
          mes: number
          progress: number
          reconciliation_passed: boolean | null
          reconciliation_report: Json | null
          rma_id: string | null
          started_at: string
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          alerts?: Json | null
          ano: number
          company_id: string
          cost_total?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          files_processed?: number | null
          files_skipped?: number | null
          files_total?: number | null
          finished_at?: string | null
          folders_processed?: number | null
          folders_total?: number | null
          id?: string
          lancamentos_criados?: number | null
          log?: Json
          mes: number
          progress?: number
          reconciliation_passed?: boolean | null
          reconciliation_report?: Json | null
          rma_id?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          alerts?: Json | null
          ano?: number
          company_id?: string
          cost_total?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          files_processed?: number | null
          files_skipped?: number | null
          files_total?: number | null
          finished_at?: string | null
          folders_processed?: number | null
          folders_total?: number | null
          id?: string
          lancamentos_criados?: number | null
          log?: Json
          mes?: number
          progress?: number
          reconciliation_passed?: boolean | null
          reconciliation_report?: Json | null
          rma_id?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      balancete_snapshots: {
        Row: {
          ano: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          mes: number
          motivo: string | null
          origem: string | null
          payload: Json
          restored_from: string | null
          rma_id: string | null
          rows_balancete: number
          rows_bs: number
          rows_dre: number
          run_id: string | null
          scope: string
          versao: number
        }
        Insert: {
          ano: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes: number
          motivo?: string | null
          origem?: string | null
          payload?: Json
          restored_from?: string | null
          rma_id?: string | null
          rows_balancete?: number
          rows_bs?: number
          rows_dre?: number
          run_id?: string | null
          scope?: string
          versao: number
        }
        Update: {
          ano?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes?: number
          motivo?: string | null
          origem?: string | null
          payload?: Json
          restored_from?: string | null
          rma_id?: string | null
          rows_balancete?: number
          rows_bs?: number
          rows_dre?: number
          run_id?: string | null
          scope?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "balancete_snapshots_restored_from_fkey"
            columns: ["restored_from"]
            isOneToOne: false
            referencedRelation: "balancete_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      balancete_validacoes: {
        Row: {
          alertas: Json
          ano: number
          ativo_total: number
          company_id: string
          confianca_global: number | null
          created_at: string
          details: Json
          diferenca: number
          id: string
          mes: number
          passivo_total: number
          pl_total: number
          reconciled: boolean
          run_id: string | null
          updated_at: string
        }
        Insert: {
          alertas?: Json
          ano: number
          ativo_total?: number
          company_id: string
          confianca_global?: number | null
          created_at?: string
          details?: Json
          diferenca?: number
          id?: string
          mes: number
          passivo_total?: number
          pl_total?: number
          reconciled?: boolean
          run_id?: string | null
          updated_at?: string
        }
        Update: {
          alertas?: Json
          ano?: number
          ativo_total?: number
          company_id?: string
          confianca_global?: number | null
          created_at?: string
          details?: Json
          diferenca?: number
          id?: string
          mes?: number
          passivo_total?: number
          pl_total?: number
          reconciled?: boolean
          run_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      balancete_versions: {
        Row: {
          acao: string
          ano: number
          company_id: string
          confianca: number | null
          conta: string
          created_at: string
          credito: number
          debito: number
          delta_valor: number
          details: Json | null
          document_id: string | null
          id: string
          mes: number
          origem_arquivo: string | null
          rma_id: string | null
          run_id: string | null
          saldo: number
          valor: number
          versao: number
        }
        Insert: {
          acao?: string
          ano: number
          company_id: string
          confianca?: number | null
          conta: string
          created_at?: string
          credito?: number
          debito?: number
          delta_valor?: number
          details?: Json | null
          document_id?: string | null
          id?: string
          mes: number
          origem_arquivo?: string | null
          rma_id?: string | null
          run_id?: string | null
          saldo?: number
          valor?: number
          versao: number
        }
        Update: {
          acao?: string
          ano?: number
          company_id?: string
          confianca?: number | null
          conta?: string
          created_at?: string
          credito?: number
          debito?: number
          delta_valor?: number
          details?: Json | null
          document_id?: string | null
          id?: string
          mes?: number
          origem_arquivo?: string | null
          rma_id?: string | null
          run_id?: string | null
          saldo?: number
          valor?: number
          versao?: number
        }
        Relationships: []
      }
      batch_processing_config: {
        Row: {
          default_eta_hours: number
          enabled: boolean
          id: number
          max_batch_size: number
          max_concurrent_submits: number
          max_eta_hours: number
          off_peak_end_hour: number
          off_peak_start_hour: number
          off_peak_timezone: string
          schedule_in_off_peak: boolean
          threshold_pages: number
          threshold_size_mb: number
          updated_at: string
        }
        Insert: {
          default_eta_hours?: number
          enabled?: boolean
          id?: number
          max_batch_size?: number
          max_concurrent_submits?: number
          max_eta_hours?: number
          off_peak_end_hour?: number
          off_peak_start_hour?: number
          off_peak_timezone?: string
          schedule_in_off_peak?: boolean
          threshold_pages?: number
          threshold_size_mb?: number
          updated_at?: string
        }
        Update: {
          default_eta_hours?: number
          enabled?: boolean
          id?: number
          max_batch_size?: number
          max_concurrent_submits?: number
          max_eta_hours?: number
          off_peak_end_hour?: number
          off_peak_start_hour?: number
          off_peak_timezone?: string
          schedule_in_off_peak?: boolean
          threshold_pages?: number
          threshold_size_mb?: number
          updated_at?: string
        }
        Relationships: []
      }
      bs_consolidado: {
        Row: {
          ah_pct: number | null
          ano: number
          av_pct: number | null
          codigo: string
          company_id: string
          created_at: string
          descricao: string
          fonte: string | null
          grupo: string | null
          hash_doc: string | null
          id: string
          mes: number
          nivel: number
          rma_id: string | null
          secao: string
          updated_at: string
          valor: number
        }
        Insert: {
          ah_pct?: number | null
          ano: number
          av_pct?: number | null
          codigo: string
          company_id: string
          created_at?: string
          descricao: string
          fonte?: string | null
          grupo?: string | null
          hash_doc?: string | null
          id?: string
          mes: number
          nivel?: number
          rma_id?: string | null
          secao: string
          updated_at?: string
          valor?: number
        }
        Update: {
          ah_pct?: number | null
          ano?: number
          av_pct?: number | null
          codigo?: string
          company_id?: string
          created_at?: string
          descricao?: string
          fonte?: string | null
          grupo?: string | null
          hash_doc?: string | null
          id?: string
          mes?: number
          nivel?: number
          rma_id?: string | null
          secao?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          active: boolean
          codigo: string | null
          company_id: string | null
          conta: string
          created_at: string
          descricao: string
          grupo: string | null
          id: string
          is_analytical: boolean
          is_template: boolean
          natureza: string | null
          nivel: number
          ordem: number | null
          parent_conta: string | null
          source: string
          subgrupo: string | null
          template_name: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          codigo?: string | null
          company_id?: string | null
          conta: string
          created_at?: string
          descricao: string
          grupo?: string | null
          id?: string
          is_analytical?: boolean
          is_template?: boolean
          natureza?: string | null
          nivel: number
          ordem?: number | null
          parent_conta?: string | null
          source?: string
          subgrupo?: string | null
          template_name?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          codigo?: string | null
          company_id?: string | null
          conta?: string
          created_at?: string
          descricao?: string
          grupo?: string | null
          id?: string
          is_analytical?: boolean
          is_template?: boolean
          natureza?: string | null
          nivel?: number
          ordem?: number | null
          parent_conta?: string | null
          source?: string
          subgrupo?: string | null
          template_name?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          auto_monthly: boolean
          city: string | null
          cnae: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          current_period_month: number | null
          email: string | null
          execution_year: number | null
          id: string
          last_analyzed_period: string | null
          name: string
          notes: string | null
          payment_due_date: string | null
          payment_status: string
          period_active: boolean
          phone: string | null
          phone_fixed: string | null
          rma_id: string | null
          sector: string | null
          source: string
          status: string
          uf: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          auto_monthly?: boolean
          city?: string | null
          cnae?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          current_period_month?: number | null
          email?: string | null
          execution_year?: number | null
          id?: string
          last_analyzed_period?: string | null
          name: string
          notes?: string | null
          payment_due_date?: string | null
          payment_status?: string
          period_active?: boolean
          phone?: string | null
          phone_fixed?: string | null
          rma_id?: string | null
          sector?: string | null
          source?: string
          status?: string
          uf?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          auto_monthly?: boolean
          city?: string | null
          cnae?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          current_period_month?: number | null
          email?: string | null
          execution_year?: number | null
          id?: string
          last_analyzed_period?: string | null
          name?: string
          notes?: string | null
          payment_due_date?: string | null
          payment_status?: string
          period_active?: boolean
          phone?: string | null
          phone_fixed?: string | null
          rma_id?: string | null
          sector?: string | null
          source?: string
          status?: string
          uf?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      company_consultants: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          company_id: string
          consultant_user_id: string
          id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          company_id: string
          consultant_user_id: string
          id?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          company_id?: string
          consultant_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_consultants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_context: {
        Row: {
          chave: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          rma_id: string | null
          scope: string
          updated_at: string
          valor: string
          weight: number
        }
        Insert: {
          chave: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          rma_id?: string | null
          scope?: string
          updated_at?: string
          valor: string
          weight?: number
        }
        Update: {
          chave?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          rma_id?: string | null
          scope?: string
          updated_at?: string
          valor?: string
          weight?: number
        }
        Relationships: []
      }
      company_memory_embeddings: {
        Row: {
          company_id: string
          conteudo: string
          created_at: string
          created_by: string | null
          document_id: string | null
          embedding: string | null
          extraction_id: string | null
          id: string
          rma_id: string | null
          source: string | null
          tipo: string
          weight: number
        }
        Insert: {
          company_id: string
          conteudo: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          embedding?: string | null
          extraction_id?: string | null
          id?: string
          rma_id?: string | null
          source?: string | null
          tipo?: string
          weight?: number
        }
        Update: {
          company_id?: string
          conteudo?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          embedding?: string | null
          extraction_id?: string | null
          id?: string
          rma_id?: string | null
          source?: string | null
          tipo?: string
          weight?: number
        }
        Relationships: []
      }
      company_rma_topics: {
        Row: {
          company_id: string
          created_at: string
          id: string
          topic_name: string
          topic_number: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          topic_name: string
          topic_number: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          topic_name?: string
          topic_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_rma_topics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_rules: {
        Row: {
          ativa: boolean
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          prioridade: number
          regra: string
          rma_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          prioridade?: number
          regra: string
          rma_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          prioridade?: number
          regra?: string
          rma_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      control_card_history: {
        Row: {
          actor: string | null
          card_id: string
          created_at: string
          from_responsible: string | null
          from_status: string | null
          id: string
          note: string | null
          to_responsible: string | null
          to_status: string | null
        }
        Insert: {
          actor?: string | null
          card_id: string
          created_at?: string
          from_responsible?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          to_responsible?: string | null
          to_status?: string | null
        }
        Update: {
          actor?: string | null
          card_id?: string
          created_at?: string
          from_responsible?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          to_responsible?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "control_card_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "control_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      control_cards: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          folder_id: string
          id: string
          priority: string
          responsible: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          folder_id: string
          id?: string
          priority?: string
          responsible?: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          folder_id?: string
          id?: string
          priority?: string
          responsible?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_cards_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "control_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      control_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      control_users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          context_id: string | null
          context_type: string | null
          created_at: string
          created_by: string
          departamento: string | null
          id: string
          last_message_at: string
          priority: string
          sla_due_at: string | null
          sla_hours: number | null
          status: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          created_by: string
          departamento?: string | null
          id?: string
          last_message_at?: string
          priority?: string
          sla_due_at?: string | null
          sla_hours?: number | null
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          created_by?: string
          departamento?: string | null
          id?: string
          last_message_at?: string
          priority?: string
          sla_due_at?: string | null
          sla_hours?: number | null
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cross_validation_runs: {
        Row: {
          ano: number | null
          checked: number
          company_id: string
          created_at: string
          id: string
          issues: Json
          mes: number | null
          passed: boolean
          persisted_versions: number
          rma_id: string | null
          score: number
          summary: Json
          triggered_by: string | null
        }
        Insert: {
          ano?: number | null
          checked?: number
          company_id: string
          created_at?: string
          id?: string
          issues?: Json
          mes?: number | null
          passed?: boolean
          persisted_versions?: number
          rma_id?: string | null
          score?: number
          summary?: Json
          triggered_by?: string | null
        }
        Update: {
          ano?: number | null
          checked?: number
          company_id?: string
          created_at?: string
          id?: string
          issues?: Json
          mes?: number | null
          passed?: boolean
          persisted_versions?: number
          rma_id?: string | null
          score?: number
          summary?: Json
          triggered_by?: string | null
        }
        Relationships: []
      }
      dataset_feedback: {
        Row: {
          classe: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          extraction_id: string | null
          field: string
          id: string
          new_value: Json | null
          old_value: Json | null
          validated_id: string | null
        }
        Insert: {
          classe?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          extraction_id?: string | null
          field: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          validated_id?: string | null
        }
        Update: {
          classe?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          extraction_id?: string | null
          field?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          validated_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_feedback_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "ai_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_feedback_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "vw_training_pending"
            referencedColumns: ["extraction_id"]
          },
          {
            foreignKeyName: "dataset_feedback_validated_id_fkey"
            columns: ["validated_id"]
            isOneToOne: false
            referencedRelation: "dataset_validated"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_validated: {
        Row: {
          agent: string | null
          classe: string
          corrections: Json | null
          created_at: string
          document_id: string | null
          extraction_id: string | null
          id: string
          input_text: string
          normalized_text: string | null
          notes: string | null
          output_correto: Json
          output_original: Json | null
          path: string | null
          rma_id: string | null
          source: string
          updated_at: string
          validated_by: string | null
        }
        Insert: {
          agent?: string | null
          classe: string
          corrections?: Json | null
          created_at?: string
          document_id?: string | null
          extraction_id?: string | null
          id?: string
          input_text: string
          normalized_text?: string | null
          notes?: string | null
          output_correto: Json
          output_original?: Json | null
          path?: string | null
          rma_id?: string | null
          source?: string
          updated_at?: string
          validated_by?: string | null
        }
        Update: {
          agent?: string | null
          classe?: string
          corrections?: Json | null
          created_at?: string
          document_id?: string | null
          extraction_id?: string | null
          id?: string
          input_text?: string
          normalized_text?: string | null
          notes?: string | null
          output_correto?: Json
          output_original?: Json | null
          path?: string | null
          rma_id?: string | null
          source?: string
          updated_at?: string
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_validated_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "ai_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_validated_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "vw_training_pending"
            referencedColumns: ["extraction_id"]
          },
        ]
      }
      deferred_jobs: {
        Row: {
          attempts: number
          chunk_index: number | null
          chunks_total: number | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          document_id: string | null
          engine: string
          error_message: string | null
          eta_at: string | null
          file_id: string
          file_name: string
          file_size_bytes: number | null
          folder_path: string | null
          gcs_input_uri: string | null
          gcs_output_uri: string | null
          id: string
          max_attempts: number
          mime_type: string | null
          operation_name: string | null
          page_count_estimate: number | null
          payload: Json
          rma_id: string | null
          split_parent_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          chunk_index?: number | null
          chunks_total?: number | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          document_id?: string | null
          engine?: string
          error_message?: string | null
          eta_at?: string | null
          file_id: string
          file_name: string
          file_size_bytes?: number | null
          folder_path?: string | null
          gcs_input_uri?: string | null
          gcs_output_uri?: string | null
          id?: string
          max_attempts?: number
          mime_type?: string | null
          operation_name?: string | null
          page_count_estimate?: number | null
          payload?: Json
          rma_id?: string | null
          split_parent_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          chunk_index?: number | null
          chunks_total?: number | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          document_id?: string | null
          engine?: string
          error_message?: string | null
          eta_at?: string | null
          file_id?: string
          file_name?: string
          file_size_bytes?: number | null
          folder_path?: string | null
          gcs_input_uri?: string | null
          gcs_output_uri?: string | null
          id?: string
          max_attempts?: number
          mime_type?: string | null
          operation_name?: string | null
          page_count_estimate?: number | null
          payload?: Json
          rma_id?: string | null
          split_parent_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deferred_jobs_split_parent_id_fkey"
            columns: ["split_parent_id"]
            isOneToOne: false
            referencedRelation: "deferred_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_embeddings: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          rma_id: string
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          rma_id: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          rma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_latest: {
        Row: {
          document_id: string
          last_stage: string | null
          latest_version: number
          updated_at: string
        }
        Insert: {
          document_id: string
          last_stage?: string | null
          latest_version?: number
          updated_at?: string
        }
        Update: {
          document_id?: string
          last_stage?: string | null
          latest_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      document_patterns: {
        Row: {
          active: boolean
          company_id: string | null
          confidence: number | null
          created_at: string
          embedding: string | null
          empresa_nome: string | null
          fornecedor: string | null
          hits: number
          id: string
          last_used_at: string | null
          layout_label: string | null
          sample_text: string | null
          schema_detectado: Json
          successes: number
          tipo_documento: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          empresa_nome?: string | null
          fornecedor?: string | null
          hits?: number
          id?: string
          last_used_at?: string | null
          layout_label?: string | null
          sample_text?: string | null
          schema_detectado?: Json
          successes?: number
          tipo_documento: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          embedding?: string | null
          empresa_nome?: string | null
          fornecedor?: string | null
          hits?: number
          id?: string
          last_used_at?: string | null
          layout_label?: string | null
          sample_text?: string | null
          schema_detectado?: Json
          successes?: number
          tipo_documento?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      document_state: {
        Row: {
          agent: string | null
          classe: string | null
          company_id: string | null
          confidence: number | null
          created_at: string
          document_id: string
          error_message: string | null
          extracted_data: Json | null
          file_id: string | null
          last_stage: string
          latest_version: number
          rma_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent?: string | null
          classe?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          document_id: string
          error_message?: string | null
          extracted_data?: Json | null
          file_id?: string | null
          last_stage?: string
          latest_version?: number
          rma_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent?: string | null
          classe?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          document_id?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_id?: string | null
          last_stage?: string
          latest_version?: number
          rma_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          agent: string | null
          classe: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          data: Json
          document_id: string
          file_id: string | null
          id: string
          stage: string
          version: number
        }
        Insert: {
          agent?: string | null
          classe?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          data?: Json
          document_id: string
          file_id?: string | null
          id?: string
          stage: string
          version: number
        }
        Update: {
          agent?: string | null
          classe?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          data?: Json
          document_id?: string
          file_id?: string | null
          id?: string
          stage?: string
          version?: number
        }
        Relationships: []
      }
      dre_consolidado: {
        Row: {
          ano: number
          codigo: string | null
          company_id: string
          confianca_global: number | null
          conta: string
          created_at: string
          credito: number
          debito: number
          descricao: string
          grupo: string
          id: string
          mes: number
          nivel: number
          origem_lancamento_ids: string[] | null
          qtd_lancamentos: number
          reconciled: boolean
          reconciliation_notes: Json | null
          rma_id: string | null
          run_id: string | null
          saldo: number
          subgrupo: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          ano: number
          codigo?: string | null
          company_id: string
          confianca_global?: number | null
          conta: string
          created_at?: string
          credito?: number
          debito?: number
          descricao: string
          grupo: string
          id?: string
          mes: number
          nivel?: number
          origem_lancamento_ids?: string[] | null
          qtd_lancamentos?: number
          reconciled?: boolean
          reconciliation_notes?: Json | null
          rma_id?: string | null
          run_id?: string | null
          saldo?: number
          subgrupo?: string | null
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          ano?: number
          codigo?: string | null
          company_id?: string
          confianca_global?: number | null
          conta?: string
          created_at?: string
          credito?: number
          debito?: number
          descricao?: string
          grupo?: string
          id?: string
          mes?: number
          nivel?: number
          origem_lancamento_ids?: string[] | null
          qtd_lancamentos?: number
          reconciled?: boolean
          reconciliation_notes?: Json | null
          rma_id?: string | null
          run_id?: string | null
          saldo?: number
          subgrupo?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      export_definitions: {
        Row: {
          code: string
          column_definition: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          format_definition: Json | null
          id: string
          is_active: boolean | null
          name: string
          output_filename_pattern: string | null
          permission_key: string | null
          route_key: string | null
          sort_definition: Json | null
          source_view: string
          template_path: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          code: string
          column_definition?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          format_definition?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          output_filename_pattern?: string | null
          permission_key?: string | null
          route_key?: string | null
          sort_definition?: Json | null
          source_view: string
          template_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          code?: string
          column_definition?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          format_definition?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          output_filename_pattern?: string | null
          permission_key?: string | null
          route_key?: string | null
          sort_definition?: Json | null
          source_view?: string
          template_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      export_downloads: {
        Row: {
          created_at: string | null
          downloaded_at: string | null
          downloaded_by: string
          export_run_id: string
          id: string
          ip_hash: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          downloaded_at?: string | null
          downloaded_by: string
          export_run_id: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          downloaded_at?: string | null
          downloaded_by?: string
          export_run_id?: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_downloads_export_run_id_fkey"
            columns: ["export_run_id"]
            isOneToOne: false
            referencedRelation: "export_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      export_runs: {
        Row: {
          created_at: string | null
          definition_version: number | null
          error_code: string | null
          error_message: string | null
          export_definition_id: string
          file_hash_sha256: string | null
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
          filters: Json | null
          finished_at: string | null
          id: string
          record_count: number | null
          requested_by: string
          source_max_updated_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["export_status"]
          template_version: number | null
        }
        Insert: {
          created_at?: string | null
          definition_version?: number | null
          error_code?: string | null
          error_message?: string | null
          export_definition_id: string
          file_hash_sha256?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          filters?: Json | null
          finished_at?: string | null
          id?: string
          record_count?: number | null
          requested_by: string
          source_max_updated_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_status"]
          template_version?: number | null
        }
        Update: {
          created_at?: string | null
          definition_version?: number | null
          error_code?: string | null
          error_message?: string | null
          export_definition_id?: string
          file_hash_sha256?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          filters?: Json | null
          finished_at?: string | null
          id?: string
          record_count?: number | null
          requested_by?: string
          source_max_updated_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_status"]
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "export_runs_export_definition_id_fkey"
            columns: ["export_definition_id"]
            isOneToOne: false
            referencedRelation: "export_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_jobs: {
        Row: {
          ano: number | null
          attempts: number
          company_id: string | null
          created_at: string
          error_message: string | null
          failed_at: string
          file_id: string
          id: string
          mes: number | null
          original_queue_id: string | null
          payload: Json | null
          reason: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rma_id: string | null
        }
        Insert: {
          ano?: number | null
          attempts?: number
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          failed_at?: string
          file_id: string
          id?: string
          mes?: number | null
          original_queue_id?: string | null
          payload?: Json | null
          reason?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rma_id?: string | null
        }
        Update: {
          ano?: number | null
          attempts?: number
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          failed_at?: string
          file_id?: string
          id?: string
          mes?: number | null
          original_queue_id?: string | null
          payload?: Json | null
          reason?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rma_id?: string | null
        }
        Relationships: []
      }
      financial_alerts: {
        Row: {
          ano: number | null
          categoria: string
          company_id: string
          created_at: string
          id: string
          mensagem: string
          mes: number | null
          metricas: Json | null
          origem: string
          periodo_ref: string | null
          recomendacao: string | null
          severidade: string
          titulo: string
        }
        Insert: {
          ano?: number | null
          categoria: string
          company_id: string
          created_at?: string
          id?: string
          mensagem: string
          mes?: number | null
          metricas?: Json | null
          origem: string
          periodo_ref?: string | null
          recomendacao?: string | null
          severidade: string
          titulo: string
        }
        Update: {
          ano?: number | null
          categoria?: string
          company_id?: string
          created_at?: string
          id?: string
          mensagem?: string
          mes?: number | null
          metricas?: Json | null
          origem?: string
          periodo_ref?: string | null
          recomendacao?: string | null
          severidade?: string
          titulo?: string
        }
        Relationships: []
      }
      fluxo_caixa_consolidado: {
        Row: {
          ano: number
          categoria: string
          company_id: string
          confianca_global: number | null
          created_at: string
          descricao: string
          entradas: number
          id: string
          mes: number
          origem_lancamento_ids: string[] | null
          qtd_lancamentos: number
          rma_id: string | null
          run_id: string | null
          saidas: number
          saldo: number
          subcategoria: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          ano: number
          categoria: string
          company_id: string
          confianca_global?: number | null
          created_at?: string
          descricao: string
          entradas?: number
          id?: string
          mes: number
          origem_lancamento_ids?: string[] | null
          qtd_lancamentos?: number
          rma_id?: string | null
          run_id?: string | null
          saidas?: number
          saldo?: number
          subcategoria?: string | null
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          ano?: number
          categoria?: string
          company_id?: string
          confianca_global?: number | null
          created_at?: string
          descricao?: string
          entradas?: number
          id?: string
          mes?: number
          origem_lancamento_ids?: string[] | null
          qtd_lancamentos?: number
          rma_id?: string | null
          run_id?: string | null
          saidas?: number
          saldo?: number
          subcategoria?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          classe: string | null
          created_at: string
          details: Json | null
          document_id: string | null
          extraction_id: string | null
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          rma_id: string | null
          severity: string
          status: string
        }
        Insert: {
          alert_type: string
          classe?: string | null
          created_at?: string
          details?: Json | null
          document_id?: string | null
          extraction_id?: string | null
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          rma_id?: string | null
          severity?: string
          status?: string
        }
        Update: {
          alert_type?: string
          classe?: string | null
          created_at?: string
          details?: Json | null
          document_id?: string | null
          extraction_id?: string | null
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rma_id?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "ai_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "vw_training_pending"
            referencedColumns: ["extraction_id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          ano: number
          categoria: string
          codigo: string | null
          company_id: string
          confianca_ia: number | null
          confianca_mapeamento: number | null
          confianca_ocr: number | null
          conta: string | null
          created_at: string
          credito: number
          data_documento: string | null
          debito: number
          descricao_original: string
          descricao_padronizada: string | null
          document_id: string | null
          extraction_id: string | null
          grupo: string | null
          id: string
          linha: number | null
          merge_key: string | null
          mes: number
          notes: string | null
          origem_arquivo: string | null
          pagina: number | null
          protected: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          rma_id: string | null
          saldo: number
          status: string
          subgrupo: string | null
          tipo_lancamento: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano: number
          categoria: string
          codigo?: string | null
          company_id: string
          confianca_ia?: number | null
          confianca_mapeamento?: number | null
          confianca_ocr?: number | null
          conta?: string | null
          created_at?: string
          credito?: number
          data_documento?: string | null
          debito?: number
          descricao_original: string
          descricao_padronizada?: string | null
          document_id?: string | null
          extraction_id?: string | null
          grupo?: string | null
          id?: string
          linha?: number | null
          merge_key?: string | null
          mes: number
          notes?: string | null
          origem_arquivo?: string | null
          pagina?: number | null
          protected?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          rma_id?: string | null
          saldo?: number
          status?: string
          subgrupo?: string | null
          tipo_lancamento?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ano?: number
          categoria?: string
          codigo?: string | null
          company_id?: string
          confianca_ia?: number | null
          confianca_mapeamento?: number | null
          confianca_ocr?: number | null
          conta?: string | null
          created_at?: string
          credito?: number
          data_documento?: string | null
          debito?: number
          descricao_original?: string
          descricao_padronizada?: string | null
          document_id?: string | null
          extraction_id?: string | null
          grupo?: string | null
          id?: string
          linha?: number | null
          merge_key?: string | null
          mes?: number
          notes?: string | null
          origem_arquivo?: string | null
          pagina?: number | null
          protected?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          rma_id?: string | null
          saldo?: number
          status?: string
          subgrupo?: string | null
          tipo_lancamento?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      llm_response_cache: {
        Row: {
          created_at: string
          expires_at: string | null
          hit_count: number
          id: string
          last_hit_at: string | null
          model: string
          prompt_hash: string
          prompt_preview: string | null
          provider: string
          response: Json
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          model: string
          prompt_hash: string
          prompt_preview?: string | null
          provider: string
          response: Json
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          model?: string
          prompt_hash?: string
          prompt_preview?: string | null
          provider?: string
          response?: Json
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string
          url: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by: string
          url: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          ip: string | null
          message_id: string
          read_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          id?: string
          ip?: string | null
          message_id: string
          read_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          id?: string
          ip?: string | null
          message_id?: string
          read_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          assigned_to: string | null
          attachment_url: string | null
          author_id: string
          content: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          mentions: string[]
          message_type: string
          metadata: Json
          priority: string
        }
        Insert: {
          assigned_to?: string | null
          attachment_url?: string | null
          author_id: string
          content: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          mentions?: string[]
          message_type?: string
          metadata?: Json
          priority?: string
        }
        Update: {
          assigned_to?: string | null
          attachment_url?: string | null
          author_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          mentions?: string[]
          message_type?: string
          metadata?: Json
          priority?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      nfe_compras: {
        Row: {
          categoria: string | null
          cfop: string | null
          chave_nfe: string | null
          cnpj: string | null
          cnpj_fornecedor: string | null
          company_id: string | null
          confidence_score: number | null
          created_at: string
          data_emissao: string | null
          data_entrada: string | null
          descricao: string | null
          document_id: string | null
          empresa: string | null
          extraction_id: string | null
          fornecedor: string | null
          id: string
          linha_origem: number | null
          natureza_operacao: string | null
          ncm: string | null
          numero_nota: string | null
          origem_arquivo: string | null
          rma_id: string | null
          serie: string | null
          tipo: string
          updated_at: string
          valid: boolean | null
          validated_at: string | null
          validated_by: string | null
          valor_cofins: number | null
          valor_desconto: number | null
          valor_frete: number | null
          valor_icms: number | null
          valor_ipi: number | null
          valor_pis: number | null
          valor_produtos: number | null
          valor_st: number | null
          valor_total: number | null
          warnings: Json | null
        }
        Insert: {
          categoria?: string | null
          cfop?: string | null
          chave_nfe?: string | null
          cnpj?: string | null
          cnpj_fornecedor?: string | null
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          data_emissao?: string | null
          data_entrada?: string | null
          descricao?: string | null
          document_id?: string | null
          empresa?: string | null
          extraction_id?: string | null
          fornecedor?: string | null
          id?: string
          linha_origem?: number | null
          natureza_operacao?: string | null
          ncm?: string | null
          numero_nota?: string | null
          origem_arquivo?: string | null
          rma_id?: string | null
          serie?: string | null
          tipo?: string
          updated_at?: string
          valid?: boolean | null
          validated_at?: string | null
          validated_by?: string | null
          valor_cofins?: number | null
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_icms?: number | null
          valor_ipi?: number | null
          valor_pis?: number | null
          valor_produtos?: number | null
          valor_st?: number | null
          valor_total?: number | null
          warnings?: Json | null
        }
        Update: {
          categoria?: string | null
          cfop?: string | null
          chave_nfe?: string | null
          cnpj?: string | null
          cnpj_fornecedor?: string | null
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          data_emissao?: string | null
          data_entrada?: string | null
          descricao?: string | null
          document_id?: string | null
          empresa?: string | null
          extraction_id?: string | null
          fornecedor?: string | null
          id?: string
          linha_origem?: number | null
          natureza_operacao?: string | null
          ncm?: string | null
          numero_nota?: string | null
          origem_arquivo?: string | null
          rma_id?: string | null
          serie?: string | null
          tipo?: string
          updated_at?: string
          valid?: boolean | null
          validated_at?: string | null
          validated_by?: string | null
          valor_cofins?: number | null
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_icms?: number | null
          valor_ipi?: number | null
          valor_pis?: number | null
          valor_produtos?: number | null
          valor_st?: number | null
          valor_total?: number | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "nfe_compras_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "ai_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfe_compras_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "vw_training_pending"
            referencedColumns: ["extraction_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          message_id: string | null
          occurrence_id: string | null
          priority: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          message_id?: string | null
          occurrence_id?: string | null
          priority?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          message_id?: string | null
          occurrence_id?: string | null
          priority?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrences: {
        Row: {
          anexos: Json
          context_id: string | null
          context_type: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          descricao: string
          id: string
          impacto: string | null
          prazo: string | null
          prioridade: string
          resolved_at: string | null
          responsavel_id: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json
          context_id?: string | null
          context_type?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by: string
          descricao: string
          id?: string
          impacto?: string | null
          prazo?: string | null
          prioridade?: string
          resolved_at?: string | null
          responsavel_id?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          anexos?: Json
          context_id?: string | null
          context_type?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          impacto?: string | null
          prazo?: string | null
          prioridade?: string
          resolved_at?: string | null
          responsavel_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_agent_runs: {
        Row: {
          agent_id: string
          created_at: string
          detected_type: string | null
          document_name: string
          duration_ms: number | null
          error_message: string | null
          extracted_data: Json | null
          id: string
          status: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          detected_type?: string | null
          document_name: string
          duration_ms?: number | null
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          status?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          detected_type?: string | null
          document_name?: string
          duration_ms?: number | null
          error_message?: string | null
          extracted_data?: Json | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ocr_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_agents: {
        Row: {
          accepted_types: string[]
          ai_model: string
          classification_rules: Json
          created_at: string
          created_by: string | null
          description: string | null
          folder_path: string
          id: string
          name: string
          ocr_engine: string
          status: string
          sub_agents: Json
          system_prompt: string | null
          temperature: number
          updated_at: string
        }
        Insert: {
          accepted_types?: string[]
          ai_model?: string
          classification_rules?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder_path: string
          id?: string
          name: string
          ocr_engine?: string
          status?: string
          sub_agents?: Json
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
        }
        Update: {
          accepted_types?: string[]
          ai_model?: string
          classification_rules?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder_path?: string
          id?: string
          name?: string
          ocr_engine?: string
          status?: string
          sub_agents?: Json
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      ocr_cache: {
        Row: {
          confidence: number | null
          created_at: string
          engine: string
          file_hash: string
          hits: number
          last_used_at: string
          normalized_text: string | null
          page_count: number | null
          raw_text: string | null
          structured_blocks: Json | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          engine?: string
          file_hash: string
          hits?: number
          last_used_at?: string
          normalized_text?: string | null
          page_count?: number | null
          raw_text?: string | null
          structured_blocks?: Json | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          engine?: string
          file_hash?: string
          hits?: number
          last_used_at?: string
          normalized_text?: string | null
          page_count?: number | null
          raw_text?: string | null
          structured_blocks?: Json | null
        }
        Relationships: []
      }
      ocr_embeddings: {
        Row: {
          agent: string | null
          classe: string | null
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          normalized_text: string | null
          ocr_result_id: string | null
          path: string | null
          rma_id: string | null
          source: string
          text: string
        }
        Insert: {
          agent?: string | null
          classe?: string | null
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          normalized_text?: string | null
          ocr_result_id?: string | null
          path?: string | null
          rma_id?: string | null
          source?: string
          text: string
        }
        Update: {
          agent?: string | null
          classe?: string | null
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          normalized_text?: string | null
          ocr_result_id?: string | null
          path?: string | null
          rma_id?: string | null
          source?: string
          text?: string
        }
        Relationships: []
      }
      ocr_results: {
        Row: {
          confidence: number | null
          created_at: string
          document_id: string
          engine: string
          error_message: string | null
          id: string
          normalized_text: string | null
          page_count: number | null
          pages_processed: number | null
          pages_total: number | null
          progress: number
          raw_text: string | null
          rma_id: string | null
          status: string
          structure: Json | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          document_id: string
          engine?: string
          error_message?: string | null
          id?: string
          normalized_text?: string | null
          page_count?: number | null
          pages_processed?: number | null
          pages_total?: number | null
          progress?: number
          raw_text?: string | null
          rma_id?: string | null
          status?: string
          structure?: Json | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          document_id?: string
          engine?: string
          error_message?: string | null
          id?: string
          normalized_text?: string | null
          page_count?: number | null
          pages_processed?: number | null
          pages_total?: number | null
          progress?: number
          raw_text?: string | null
          rma_id?: string | null
          status?: string
          structure?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      onedrive_files: {
        Row: {
          ano: number | null
          company_id: string | null
          created_at: string
          ctag: string | null
          drive_id: string | null
          error_message: string | null
          etag: string | null
          file_id: string
          file_name: string
          file_type: string | null
          first_seen_at: string
          hash: string | null
          last_learning_at: string | null
          last_learning_error: string | null
          last_modified: string | null
          last_parse_error_at: string | null
          last_processed_at: string | null
          last_scan_id: string | null
          last_seen_at: string
          learning_attempts: number
          mes: number | null
          metadata: Json | null
          mime_type: string | null
          parse_attempts: number
          path: string
          reprocess_count: number
          requires_manual_upload: boolean
          rma_id: string | null
          size_bytes: number | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          ano?: number | null
          company_id?: string | null
          created_at?: string
          ctag?: string | null
          drive_id?: string | null
          error_message?: string | null
          etag?: string | null
          file_id: string
          file_name: string
          file_type?: string | null
          first_seen_at?: string
          hash?: string | null
          last_learning_at?: string | null
          last_learning_error?: string | null
          last_modified?: string | null
          last_parse_error_at?: string | null
          last_processed_at?: string | null
          last_scan_id?: string | null
          last_seen_at?: string
          learning_attempts?: number
          mes?: number | null
          metadata?: Json | null
          mime_type?: string | null
          parse_attempts?: number
          path: string
          reprocess_count?: number
          requires_manual_upload?: boolean
          rma_id?: string | null
          size_bytes?: number | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          ano?: number | null
          company_id?: string | null
          created_at?: string
          ctag?: string | null
          drive_id?: string | null
          error_message?: string | null
          etag?: string | null
          file_id?: string
          file_name?: string
          file_type?: string | null
          first_seen_at?: string
          hash?: string | null
          last_learning_at?: string | null
          last_learning_error?: string | null
          last_modified?: string | null
          last_parse_error_at?: string | null
          last_processed_at?: string | null
          last_scan_id?: string | null
          last_seen_at?: string
          learning_attempts?: number
          mes?: number | null
          metadata?: Json | null
          mime_type?: string | null
          parse_attempts?: number
          path?: string
          reprocess_count?: number
          requires_manual_upload?: boolean
          rma_id?: string | null
          size_bytes?: number | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      onedrive_scan_runs: {
        Row: {
          ano: number | null
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          files_ignored: number
          files_inactive: number
          files_invalid: number
          files_new: number
          files_scanned: number
          files_updated: number
          folder_path: string | null
          id: string
          mes: number | null
          rma_id: string | null
          scan_id: string
          source: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          ano?: number | null
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          files_ignored?: number
          files_inactive?: number
          files_invalid?: number
          files_new?: number
          files_scanned?: number
          files_updated?: number
          folder_path?: string | null
          id?: string
          mes?: number | null
          rma_id?: string | null
          scan_id?: string
          source?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          ano?: number | null
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          files_ignored?: number
          files_inactive?: number
          files_invalid?: number
          files_new?: number
          files_scanned?: number
          files_updated?: number
          folder_path?: string | null
          id?: string
          mes?: number | null
          rma_id?: string | null
          scan_id?: string
          source?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      orchestration_log: {
        Row: {
          agente_vencedor: string | null
          agentes_executados: string[]
          classe: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          duration_ms: number | null
          estrategia: string
          evidencias: Json
          file_id: string | null
          id: string
          motivo: string | null
          resultado_final: Json | null
          rma_id: string | null
          score_confianca: number | null
          validado: boolean
        }
        Insert: {
          agente_vencedor?: string | null
          agentes_executados?: string[]
          classe?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          duration_ms?: number | null
          estrategia?: string
          evidencias?: Json
          file_id?: string | null
          id?: string
          motivo?: string | null
          resultado_final?: Json | null
          rma_id?: string | null
          score_confianca?: number | null
          validado?: boolean
        }
        Update: {
          agente_vencedor?: string | null
          agentes_executados?: string[]
          classe?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          duration_ms?: number | null
          estrategia?: string
          evidencias?: Json
          file_id?: string | null
          id?: string
          motivo?: string | null
          resultado_final?: Json | null
          rma_id?: string | null
          score_confianca?: number | null
          validado?: boolean
        }
        Relationships: []
      }
      pdf_split_jobs: {
        Row: {
          chunks_done: number
          company_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          merged_extraction_id: string | null
          parent_deferred_job_id: string | null
          parent_document_id: string | null
          parent_file_id: string
          rma_id: string | null
          status: string
          total_chunks: number
          updated_at: string
        }
        Insert: {
          chunks_done?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          merged_extraction_id?: string | null
          parent_deferred_job_id?: string | null
          parent_document_id?: string | null
          parent_file_id: string
          rma_id?: string | null
          status?: string
          total_chunks: number
          updated_at?: string
        }
        Update: {
          chunks_done?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          merged_extraction_id?: string | null
          parent_deferred_job_id?: string | null
          parent_document_id?: string | null
          parent_file_id?: string
          rma_id?: string | null
          status?: string
          total_chunks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_split_jobs_parent_deferred_job_id_fkey"
            columns: ["parent_deferred_job_id"]
            isOneToOne: false
            referencedRelation: "deferred_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_documents: {
        Row: {
          created_at: string
          document_type: string | null
          entities: Json | null
          external_id: string | null
          file_name: string
          file_size: number
          id: string
          language: string | null
          mime_type: string
          nlp_confidence: number | null
          ocr_confidence: number | null
          ocr_method: string | null
          ocr_text: string | null
          page_count: number | null
          pipeline_status: string
          pipeline_step: number | null
          processed_at: string | null
          provider: string | null
          risk_indicators: Json | null
          rma_id: string
          rma_topic: number | null
          sha256_hash: string
          storage_path: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          entities?: Json | null
          external_id?: string | null
          file_name: string
          file_size: number
          id?: string
          language?: string | null
          mime_type: string
          nlp_confidence?: number | null
          ocr_confidence?: number | null
          ocr_method?: string | null
          ocr_text?: string | null
          page_count?: number | null
          pipeline_status?: string
          pipeline_step?: number | null
          processed_at?: string | null
          provider?: string | null
          risk_indicators?: Json | null
          rma_id: string
          rma_topic?: number | null
          sha256_hash: string
          storage_path?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string | null
          entities?: Json | null
          external_id?: string | null
          file_name?: string
          file_size?: number
          id?: string
          language?: string | null
          mime_type?: string
          nlp_confidence?: number | null
          ocr_confidence?: number | null
          ocr_method?: string | null
          ocr_text?: string | null
          page_count?: number | null
          pipeline_status?: string
          pipeline_step?: number | null
          processed_at?: string | null
          provider?: string | null
          risk_indicators?: Json | null
          rma_id?: string
          rma_topic?: number | null
          sha256_hash?: string
          storage_path?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_logs: {
        Row: {
          created_at: string
          details: Json | null
          document_id: string
          duration_ms: number | null
          error_message: string | null
          id: string
          status: string
          step: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          document_id: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          status?: string
          step: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          document_id?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          status?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pipeline_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          company_id: string | null
          conversation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          rma_id: string | null
          summary: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          rma_id?: string | null
          summary?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          rma_id?: string | null
          summary?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      processing_queue: {
        Row: {
          ano: number | null
          attempts: number
          batch_id: string | null
          block_reason: string | null
          chunk_index: number | null
          chunk_payload: Json | null
          chunks_total: number | null
          company_id: string | null
          created_at: string
          error_message: string | null
          file_id: string
          finished_at: string | null
          id: string
          lock_until: string | null
          locked_by: string | null
          max_attempts: number
          mes: number | null
          next_attempt_at: string
          parent_job_id: string | null
          payload: Json | null
          picked_at: string | null
          priority: number
          processing_mode: string
          reason: string
          rma_id: string | null
          status: string
          trigger_source: string
          updated_at: string
        }
        Insert: {
          ano?: number | null
          attempts?: number
          batch_id?: string | null
          block_reason?: string | null
          chunk_index?: number | null
          chunk_payload?: Json | null
          chunks_total?: number | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          file_id: string
          finished_at?: string | null
          id?: string
          lock_until?: string | null
          locked_by?: string | null
          max_attempts?: number
          mes?: number | null
          next_attempt_at?: string
          parent_job_id?: string | null
          payload?: Json | null
          picked_at?: string | null
          priority?: number
          processing_mode?: string
          reason?: string
          rma_id?: string | null
          status?: string
          trigger_source?: string
          updated_at?: string
        }
        Update: {
          ano?: number | null
          attempts?: number
          batch_id?: string | null
          block_reason?: string | null
          chunk_index?: number | null
          chunk_payload?: Json | null
          chunks_total?: number | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          file_id?: string
          finished_at?: string | null
          id?: string
          lock_until?: string | null
          locked_by?: string | null
          max_attempts?: number
          mes?: number | null
          next_attempt_at?: string
          parent_job_id?: string | null
          payload?: Json | null
          picked_at?: string | null
          priority?: number
          processing_mode?: string
          reason?: string
          rma_id?: string | null
          status?: string
          trigger_source?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          contato_principal: string | null
          created_at: string
          email: string
          endereco: string | null
          full_name: string
          id: string
          numero: string | null
          role: Database["public"]["Enums"]["app_role"]
          telefone: string | null
          treatment_sigla: string | null
          uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_principal?: string | null
          created_at?: string
          email: string
          endereco?: string | null
          full_name?: string
          id?: string
          numero?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          telefone?: string | null
          treatment_sigla?: string | null
          uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_principal?: string | null
          created_at?: string
          email?: string
          endereco?: string | null
          full_name?: string
          id?: string
          numero?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          telefone?: string | null
          treatment_sigla?: string | null
          uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_erros: {
        Row: {
          active: boolean
          classe: string
          correcao: string
          created_at: string
          erro: string
          frequencia: number
          id: string
          impacto: string
          last_seen_at: string
          promoted_to_rule: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          classe?: string
          correcao: string
          created_at?: string
          erro: string
          frequencia?: number
          id?: string
          impacto?: string
          last_seen_at?: string
          promoted_to_rule?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          classe?: string
          correcao?: string
          created_at?: string
          erro?: string
          frequencia?: number
          id?: string
          impacto?: string
          last_seen_at?: string
          promoted_to_rule?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      prompt_examples: {
        Row: {
          active: boolean
          agent: string | null
          classe: string
          created_at: string
          embedding: string | null
          id: string
          input_text: string
          last_used_at: string | null
          output_json: Json
          success_count: number
          usage_count: number
          validated_id: string | null
          weight: number
        }
        Insert: {
          active?: boolean
          agent?: string | null
          classe: string
          created_at?: string
          embedding?: string | null
          id?: string
          input_text: string
          last_used_at?: string | null
          output_json: Json
          success_count?: number
          usage_count?: number
          validated_id?: string | null
          weight?: number
        }
        Update: {
          active?: boolean
          agent?: string | null
          classe?: string
          created_at?: string
          embedding?: string | null
          id?: string
          input_text?: string
          last_used_at?: string | null
          output_json?: Json
          success_count?: number
          usage_count?: number
          validated_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_examples_validated_id_fkey"
            columns: ["validated_id"]
            isOneToOne: false
            referencedRelation: "dataset_validated"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_learning: {
        Row: {
          active: boolean
          classe: string
          classificacao_correta: string
          company_id: string | null
          confianca: number
          conta: string | null
          created_at: string
          created_by: string | null
          entrada_normalizada: string
          entrada_texto: string
          frequencia: number
          id: string
          origem: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          classe?: string
          classificacao_correta: string
          company_id?: string | null
          confianca?: number
          conta?: string | null
          created_at?: string
          created_by?: string | null
          entrada_normalizada: string
          entrada_texto: string
          frequencia?: number
          id?: string
          origem?: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          classe?: string
          classificacao_correta?: string
          company_id?: string | null
          confianca?: number
          conta?: string | null
          created_at?: string
          created_by?: string | null
          entrada_normalizada?: string
          entrada_texto?: string
          frequencia?: number
          id?: string
          origem?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          classe: string
          company_id: string | null
          components: Json
          created_at: string
          document_id: string | null
          id: string
          prompt_final: string
          prompt_hash: string
          rma_id: string | null
          tokens_estimated: number | null
          used_count: number
          version: string
        }
        Insert: {
          classe: string
          company_id?: string | null
          components?: Json
          created_at?: string
          document_id?: string | null
          id?: string
          prompt_final: string
          prompt_hash: string
          rma_id?: string | null
          tokens_estimated?: number | null
          used_count?: number
          version?: string
        }
        Update: {
          classe?: string
          company_id?: string | null
          components?: Json
          created_at?: string
          document_id?: string | null
          id?: string
          prompt_final?: string
          prompt_hash?: string
          rma_id?: string | null
          tokens_estimated?: number | null
          used_count?: number
          version?: string
        }
        Relationships: []
      }
      prospeccao_linhas: {
        Row: {
          acao_judicial: string | null
          advogado_nome: string | null
          advogado_oab: string | null
          ai_error: string | null
          ai_extracted: Json | null
          ai_status: string
          area_judicial: string | null
          assunto_judicial: string | null
          created_at: string
          data_protocolo: string | null
          denominacao: string | null
          dt_cad_causa: string | null
          dt_inicio: string | null
          endereco_requerente: string | null
          esfera: string | null
          id: string
          id_servico: string | null
          instancia: string | null
          link_documento: string | null
          municipio: string | null
          numero_processo: string | null
          orgao_tribunal: string | null
          parte_con_cnpj: string | null
          parte_con_nome: string | null
          parte_con_qualif: string | null
          parte_pro_cnpj: string | null
          parte_pro_nome: string | null
          pedidos_principais: string | null
          processo_eletronico: boolean | null
          status_processo: string | null
          tipo_acao: string | null
          uf: string | null
          updated_at: string
          upload_id: string | null
          user_id: string
          valor_pleito: number | null
        }
        Insert: {
          acao_judicial?: string | null
          advogado_nome?: string | null
          advogado_oab?: string | null
          ai_error?: string | null
          ai_extracted?: Json | null
          ai_status?: string
          area_judicial?: string | null
          assunto_judicial?: string | null
          created_at?: string
          data_protocolo?: string | null
          denominacao?: string | null
          dt_cad_causa?: string | null
          dt_inicio?: string | null
          endereco_requerente?: string | null
          esfera?: string | null
          id?: string
          id_servico?: string | null
          instancia?: string | null
          link_documento?: string | null
          municipio?: string | null
          numero_processo?: string | null
          orgao_tribunal?: string | null
          parte_con_cnpj?: string | null
          parte_con_nome?: string | null
          parte_con_qualif?: string | null
          parte_pro_cnpj?: string | null
          parte_pro_nome?: string | null
          pedidos_principais?: string | null
          processo_eletronico?: boolean | null
          status_processo?: string | null
          tipo_acao?: string | null
          uf?: string | null
          updated_at?: string
          upload_id?: string | null
          user_id: string
          valor_pleito?: number | null
        }
        Update: {
          acao_judicial?: string | null
          advogado_nome?: string | null
          advogado_oab?: string | null
          ai_error?: string | null
          ai_extracted?: Json | null
          ai_status?: string
          area_judicial?: string | null
          assunto_judicial?: string | null
          created_at?: string
          data_protocolo?: string | null
          denominacao?: string | null
          dt_cad_causa?: string | null
          dt_inicio?: string | null
          endereco_requerente?: string | null
          esfera?: string | null
          id?: string
          id_servico?: string | null
          instancia?: string | null
          link_documento?: string | null
          municipio?: string | null
          numero_processo?: string | null
          orgao_tribunal?: string | null
          parte_con_cnpj?: string | null
          parte_con_nome?: string | null
          parte_con_qualif?: string | null
          parte_pro_cnpj?: string | null
          parte_pro_nome?: string | null
          pedidos_principais?: string | null
          processo_eletronico?: boolean | null
          status_processo?: string | null
          tipo_acao?: string | null
          uf?: string | null
          updated_at?: string
          upload_id?: string | null
          user_id?: string
          valor_pleito?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_linhas_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "prospeccao_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      prospeccao_pdf_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          extracted_json: Json | null
          id: string
          linha_id: string
          link: string
          onedrive_path: string | null
          pdf_sha256: string | null
          status: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          extracted_json?: Json | null
          id?: string
          linha_id: string
          link: string
          onedrive_path?: string | null
          pdf_sha256?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          extracted_json?: Json | null
          id?: string
          linha_id?: string
          link?: string
          onedrive_path?: string | null
          pdf_sha256?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_pdf_jobs_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "prospeccao_linhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospeccao_pdf_jobs_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "vw_export_agcs_realizadas"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "prospeccao_pdf_jobs_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "vw_export_aj_nomeados"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "prospeccao_pdf_jobs_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "vw_export_cartas_aj"
            referencedColumns: ["source_id"]
          },
        ]
      }
      prospeccao_uploads: {
        Row: {
          company_id: string | null
          created_at: string
          error: string | null
          file_name: string
          file_type: string
          id: string
          rows_count: number
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          error?: string | null
          file_name: string
          file_type: string
          id?: string
          rows_count?: number
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          error?: string | null
          file_name?: string
          file_type?: string
          id?: string
          rows_count?: number
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          blocked_until: string | null
          created_at: string
          id: string
          last_block_reason: string | null
          max_requests_per_minute: number
          max_tokens_per_minute: number | null
          model: string
          provider: string
          requests_in_window: number
          tokens_in_window: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          last_block_reason?: string | null
          max_requests_per_minute?: number
          max_tokens_per_minute?: number | null
          model: string
          provider: string
          requests_in_window?: number
          tokens_in_window?: number
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          last_block_reason?: string | null
          max_requests_per_minute?: number
          max_tokens_per_minute?: number | null
          model?: string
          provider?: string
          requests_in_window?: number
          tokens_in_window?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      reprocess_audit_log: {
        Row: {
          action: string
          attempt_number: number | null
          company_id: string | null
          created_at: string
          file_id: string
          id: string
          max_attempts: number | null
          metadata: Json | null
          reason: string | null
          rma_id: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          attempt_number?: number | null
          company_id?: string | null
          created_at?: string
          file_id: string
          id?: string
          max_attempts?: number | null
          metadata?: Json | null
          reason?: string | null
          rma_id?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          attempt_number?: number | null
          company_id?: string | null
          created_at?: string
          file_id?: string
          id?: string
          max_attempts?: number | null
          metadata?: Json | null
          reason?: string | null
          rma_id?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      rma_analysis_results: {
        Row: {
          alertas: Json | null
          auto_retry_count: number
          balanco: Json | null
          company_id: string
          created_at: string
          diagnostico: Json | null
          dre: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          indicadores: Json | null
          kanitz: Json | null
          last_auto_retry_at: string | null
          lock_acquired_at: string | null
          lock_token: string | null
          locked_by: string | null
          locked_until: string | null
          log: Json
          pendencias: Json | null
          percentual: number
          score_rj: Json | null
          started_at: string
          status: string
          topics: Json
          updated_at: string
        }
        Insert: {
          alertas?: Json | null
          auto_retry_count?: number
          balanco?: Json | null
          company_id: string
          created_at?: string
          diagnostico?: Json | null
          dre?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          indicadores?: Json | null
          kanitz?: Json | null
          last_auto_retry_at?: string | null
          lock_acquired_at?: string | null
          lock_token?: string | null
          locked_by?: string | null
          locked_until?: string | null
          log?: Json
          pendencias?: Json | null
          percentual?: number
          score_rj?: Json | null
          started_at?: string
          status?: string
          topics?: Json
          updated_at?: string
        }
        Update: {
          alertas?: Json | null
          auto_retry_count?: number
          balanco?: Json | null
          company_id?: string
          created_at?: string
          diagnostico?: Json | null
          dre?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          indicadores?: Json | null
          kanitz?: Json | null
          last_auto_retry_at?: string | null
          lock_acquired_at?: string | null
          lock_token?: string | null
          locked_by?: string | null
          locked_until?: string | null
          log?: Json
          pendencias?: Json | null
          percentual?: number
          score_rj?: Json | null
          started_at?: string
          status?: string
          topics?: Json
          updated_at?: string
        }
        Relationships: []
      }
      rma_assignment_history: {
        Row: {
          action: string
          changed_by: string | null
          company_id: string
          created_at: string
          from_consultant_user_id: string | null
          id: string
          to_consultant_user_id: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          company_id: string
          created_at?: string
          from_consultant_user_id?: string | null
          id?: string
          to_consultant_user_id?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          company_id?: string
          created_at?: string
          from_consultant_user_id?: string | null
          id?: string
          to_consultant_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rma_assignment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_cobrancas: {
        Row: {
          body: string
          company_name: string | null
          created_at: string
          email_message_id: string | null
          file_name: string | null
          file_path: string | null
          file_url: string | null
          has_attachment: boolean
          id: string
          recipient_email: string
          rma_id: string
          sent_at: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          body: string
          company_name?: string | null
          created_at?: string
          email_message_id?: string | null
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          has_attachment?: boolean
          id?: string
          recipient_email: string
          rma_id: string
          sent_at?: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          body?: string
          company_name?: string | null
          created_at?: string
          email_message_id?: string | null
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          has_attachment?: boolean
          id?: string
          recipient_email?: string
          rma_id?: string
          sent_at?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: []
      }
      rma_document_charts: {
        Row: {
          created_at: string
          created_by: string | null
          dados: Json
          descricao_ia: string | null
          document_id: string
          fonte: Json
          id: string
          section_id: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao_ia?: string | null
          document_id: string
          fonte?: Json
          id?: string
          section_id?: string | null
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao_ia?: string | null
          document_id?: string
          fonte?: Json
          id?: string
          section_id?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_document_charts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rma_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rma_document_charts_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "rma_document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_document_section_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          author_role: string | null
          created_at: string
          id: string
          resolved: boolean
          section_id: string
          text: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          author_role?: string | null
          created_at?: string
          id?: string
          resolved?: boolean
          section_id: string
          text: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          author_role?: string | null
          created_at?: string
          id?: string
          resolved?: boolean
          section_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_document_section_comments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "rma_document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_document_section_versions: {
        Row: {
          acao: string | null
          author_id: string | null
          conteudo: string
          created_at: string
          id: string
          metadata: Json | null
          motivo: string | null
          origem: string
          section_id: string
          versao: number
        }
        Insert: {
          acao?: string | null
          author_id?: string | null
          conteudo: string
          created_at?: string
          id?: string
          metadata?: Json | null
          motivo?: string | null
          origem: string
          section_id: string
          versao: number
        }
        Update: {
          acao?: string | null
          author_id?: string | null
          conteudo?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          motivo?: string | null
          origem?: string
          section_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "rma_document_section_versions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "rma_document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_document_sections: {
        Row: {
          analise_ia: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          assigned_to: string | null
          chart_meta: Json
          concluido_em: string | null
          concluido_por: string | null
          conclusao_ia: Json | null
          conteudo_editado: string | null
          conteudo_ia: string | null
          created_at: string
          custo_ia: number | null
          dados_extraidos: Json | null
          dados_origem: Json
          document_id: string
          enviado_revisao_em: string | null
          enviado_revisao_por: string | null
          graficos_ids: Json
          grounding_score: number
          id: string
          insights: Json | null
          kpis: Json
          motivo_devolucao: string | null
          numero: string | null
          ordem: number
          parent_id: string | null
          prompt_contexto: string | null
          reaberto_em: string | null
          reaberto_motivo: string | null
          reaberto_por: string | null
          regen_count: number
          risco: string | null
          risk_score: number | null
          status: string
          titulo: string
          tokens_usados: number | null
          ungrounded_claims: Json
          updated_at: string
          updated_by: string | null
          validacao: Json | null
          versao_atual: number
        }
        Insert: {
          analise_ia?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          assigned_to?: string | null
          chart_meta?: Json
          concluido_em?: string | null
          concluido_por?: string | null
          conclusao_ia?: Json | null
          conteudo_editado?: string | null
          conteudo_ia?: string | null
          created_at?: string
          custo_ia?: number | null
          dados_extraidos?: Json | null
          dados_origem?: Json
          document_id: string
          enviado_revisao_em?: string | null
          enviado_revisao_por?: string | null
          graficos_ids?: Json
          grounding_score?: number
          id?: string
          insights?: Json | null
          kpis?: Json
          motivo_devolucao?: string | null
          numero?: string | null
          ordem: number
          parent_id?: string | null
          prompt_contexto?: string | null
          reaberto_em?: string | null
          reaberto_motivo?: string | null
          reaberto_por?: string | null
          regen_count?: number
          risco?: string | null
          risk_score?: number | null
          status?: string
          titulo: string
          tokens_usados?: number | null
          ungrounded_claims?: Json
          updated_at?: string
          updated_by?: string | null
          validacao?: Json | null
          versao_atual?: number
        }
        Update: {
          analise_ia?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          assigned_to?: string | null
          chart_meta?: Json
          concluido_em?: string | null
          concluido_por?: string | null
          conclusao_ia?: Json | null
          conteudo_editado?: string | null
          conteudo_ia?: string | null
          created_at?: string
          custo_ia?: number | null
          dados_extraidos?: Json | null
          dados_origem?: Json
          document_id?: string
          enviado_revisao_em?: string | null
          enviado_revisao_por?: string | null
          graficos_ids?: Json
          grounding_score?: number
          id?: string
          insights?: Json | null
          kpis?: Json
          motivo_devolucao?: string | null
          numero?: string | null
          ordem?: number
          parent_id?: string | null
          prompt_contexto?: string | null
          reaberto_em?: string | null
          reaberto_motivo?: string | null
          reaberto_por?: string | null
          regen_count?: number
          risco?: string | null
          risk_score?: number | null
          status?: string
          titulo?: string
          tokens_usados?: number | null
          ungrounded_claims?: Json
          updated_at?: string
          updated_by?: string | null
          validacao?: Json | null
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "rma_document_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rma_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rma_document_sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "rma_document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_document_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          structure: Json
          tipo: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          structure?: Json
          tipo: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          structure?: Json
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      rma_documents: {
        Row: {
          arquivo_final_gerado_em: string | null
          arquivo_final_pct: number
          arquivo_final_url: string | null
          arquivo_final_versao: number
          created_at: string
          created_by: string | null
          executive_summary: Json | null
          finalizado_at: string | null
          health_score: number | null
          id: string
          metadata: Json
          progresso: number
          released_to_recuperanda_at: string | null
          released_to_recuperanda_by: string | null
          released_to_recuperanda_notes: string | null
          risk_global: string | null
          rma_id: string
          status: string
          template_id: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          arquivo_final_gerado_em?: string | null
          arquivo_final_pct?: number
          arquivo_final_url?: string | null
          arquivo_final_versao?: number
          created_at?: string
          created_by?: string | null
          executive_summary?: Json | null
          finalizado_at?: string | null
          health_score?: number | null
          id?: string
          metadata?: Json
          progresso?: number
          released_to_recuperanda_at?: string | null
          released_to_recuperanda_by?: string | null
          released_to_recuperanda_notes?: string | null
          risk_global?: string | null
          rma_id: string
          status?: string
          template_id?: string | null
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          arquivo_final_gerado_em?: string | null
          arquivo_final_pct?: number
          arquivo_final_url?: string | null
          arquivo_final_versao?: number
          created_at?: string
          created_by?: string | null
          executive_summary?: Json | null
          finalizado_at?: string | null
          health_score?: number | null
          id?: string
          metadata?: Json
          progresso?: number
          released_to_recuperanda_at?: string | null
          released_to_recuperanda_by?: string | null
          released_to_recuperanda_notes?: string | null
          risk_global?: string | null
          rma_id?: string
          status?: string
          template_id?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rma_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_file_parse_cache: {
        Row: {
          ano: number | null
          balanco: Json
          company_id: string | null
          created_at: string
          dre: Json
          drive_id: string | null
          error_message: string | null
          etag: string | null
          file_id: string
          file_name: string
          hash: string | null
          hits: number
          id: string
          last_modified: string | null
          last_used_at: string
          mes: number | null
          mime_type: string | null
          parsed_at: string
          parser_version: string
          rma_id: string | null
          size_bytes: number | null
          tipo: string | null
          topic_name: string | null
          topic_number: number | null
          updated_at: string
        }
        Insert: {
          ano?: number | null
          balanco?: Json
          company_id?: string | null
          created_at?: string
          dre?: Json
          drive_id?: string | null
          error_message?: string | null
          etag?: string | null
          file_id: string
          file_name: string
          hash?: string | null
          hits?: number
          id?: string
          last_modified?: string | null
          last_used_at?: string
          mes?: number | null
          mime_type?: string | null
          parsed_at?: string
          parser_version?: string
          rma_id?: string | null
          size_bytes?: number | null
          tipo?: string | null
          topic_name?: string | null
          topic_number?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number | null
          balanco?: Json
          company_id?: string | null
          created_at?: string
          dre?: Json
          drive_id?: string | null
          error_message?: string | null
          etag?: string | null
          file_id?: string
          file_name?: string
          hash?: string | null
          hits?: number
          id?: string
          last_modified?: string | null
          last_used_at?: string
          mes?: number | null
          mime_type?: string | null
          parsed_at?: string
          parser_version?: string
          rma_id?: string | null
          size_bytes?: number | null
          tipo?: string | null
          topic_name?: string | null
          topic_number?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rma_monthly_snapshots: {
        Row: {
          alerts_count: number
          ano: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          mes: number
          motivo: string | null
          origem: string
          payload: Json
          percentual: number
          resumo: Json
          rma_id: string | null
          rows_balancete: number
          rows_bs: number
          rows_dre: number
          updated_at: string
          versao: number
        }
        Insert: {
          alerts_count?: number
          ano: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes: number
          motivo?: string | null
          origem?: string
          payload?: Json
          percentual?: number
          resumo?: Json
          rma_id?: string | null
          rows_balancete?: number
          rows_bs?: number
          rows_dre?: number
          updated_at?: string
          versao?: number
        }
        Update: {
          alerts_count?: number
          ano?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mes?: number
          motivo?: string | null
          origem?: string
          payload?: Json
          percentual?: number
          resumo?: Json
          rma_id?: string | null
          rows_balancete?: number
          rows_bs?: number
          rows_dre?: number
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      rma_period_analyses: {
        Row: {
          alertas: Json | null
          balanco: Json | null
          company_id: string
          created_at: string
          diagnostico: Json | null
          dre: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          indicadores: Json | null
          kanitz: Json | null
          log: Json
          month: number
          pendencias: Json | null
          percentual: number
          period_label: string
          score_rj: Json | null
          started_at: string
          status: string
          topics: Json
          updated_at: string
          year: number
        }
        Insert: {
          alertas?: Json | null
          balanco?: Json | null
          company_id: string
          created_at?: string
          diagnostico?: Json | null
          dre?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          indicadores?: Json | null
          kanitz?: Json | null
          log?: Json
          month: number
          pendencias?: Json | null
          percentual?: number
          period_label: string
          score_rj?: Json | null
          started_at?: string
          status?: string
          topics?: Json
          updated_at?: string
          year: number
        }
        Update: {
          alertas?: Json | null
          balanco?: Json | null
          company_id?: string
          created_at?: string
          diagnostico?: Json | null
          dre?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          indicadores?: Json | null
          kanitz?: Json | null
          log?: Json
          month?: number
          pendencias?: Json | null
          percentual?: number
          period_label?: string
          score_rj?: Json | null
          started_at?: string
          status?: string
          topics?: Json
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      rma_period_chain: {
        Row: {
          company_id: string
          created_at: string
          finished_at: string | null
          id: string
          last_check_at: string | null
          month: number
          notes: string | null
          sequence_order: number
          status: string
          triggered_at: string | null
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          last_check_at?: string | null
          month: number
          notes?: string | null
          sequence_order: number
          status?: string
          triggered_at?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          last_check_at?: string | null
          month?: number
          notes?: string | null
          sequence_order?: number
          status?: string
          triggered_at?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rma_period_chain_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_release_assignments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          month: number
          notes: string | null
          released_by: string | null
          released_to_role: Database["public"]["Enums"]["app_role"]
          released_to_user_id: string
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          month: number
          notes?: string | null
          released_by?: string | null
          released_to_role: Database["public"]["Enums"]["app_role"]
          released_to_user_id: string
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          month?: number
          notes?: string | null
          released_by?: string | null
          released_to_role?: Database["public"]["Enums"]["app_role"]
          released_to_user_id?: string
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      rma_section_audit_log: {
        Row: {
          action: string
          created_at: string
          document_id: string | null
          error_message: string | null
          from_status: string | null
          id: string
          metadata: Json
          motivo: string | null
          reason: string | null
          section_id: string | null
          to_status: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string
          document_id?: string | null
          error_message?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json
          motivo?: string | null
          reason?: string | null
          section_id?: string | null
          to_status?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          document_id?: string | null
          error_message?: string | null
          from_status?: string | null
          id?: string
          metadata?: Json
          motivo?: string | null
          reason?: string | null
          section_id?: string | null
          to_status?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      rma_section_data_sources: {
        Row: {
          ano: number | null
          company_id: string | null
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          mes: number | null
          metadata: Json
          periodo_label: string | null
          section_id: string
          source_id: string | null
          source_table: string | null
          source_type: string
          trecho: string | null
        }
        Insert: {
          ano?: number | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          mes?: number | null
          metadata?: Json
          periodo_label?: string | null
          section_id: string
          source_id?: string | null
          source_table?: string | null
          source_type: string
          trecho?: string | null
        }
        Update: {
          ano?: number | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          mes?: number | null
          metadata?: Json
          periodo_label?: string | null
          section_id?: string
          source_id?: string | null
          source_table?: string | null
          source_type?: string
          trecho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rma_section_data_sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rma_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rma_section_data_sources_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "rma_document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_section_evidences: {
        Row: {
          claim_text: string | null
          confidence: number | null
          created_at: string
          doc_url: string | null
          document_id: string
          hash: string | null
          id: string
          metadata: Json
          page: number | null
          section_id: string
          source_ref: Json
          source_type: string
        }
        Insert: {
          claim_text?: string | null
          confidence?: number | null
          created_at?: string
          doc_url?: string | null
          document_id: string
          hash?: string | null
          id?: string
          metadata?: Json
          page?: number | null
          section_id: string
          source_ref?: Json
          source_type: string
        }
        Update: {
          claim_text?: string | null
          confidence?: number | null
          created_at?: string
          doc_url?: string | null
          document_id?: string
          hash?: string | null
          id?: string
          metadata?: Json
          page?: number | null
          section_id?: string
          source_ref?: Json
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_section_evidences_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rma_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rma_section_evidences_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "rma_document_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      worker_config: {
        Row: {
          batch_size: number
          cron_interval_seconds: number
          enabled: boolean
          id: string
          last_run_at: string | null
          last_run_summary: Json | null
          lock_ttl_minutes: number
          max_attempts: number
          max_reprocess_attempts: number
          mode: string
          updated_at: string
        }
        Insert: {
          batch_size?: number
          cron_interval_seconds?: number
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_run_summary?: Json | null
          lock_ttl_minutes?: number
          max_attempts?: number
          max_reprocess_attempts?: number
          mode?: string
          updated_at?: string
        }
        Update: {
          batch_size?: number
          cron_interval_seconds?: number
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_run_summary?: Json | null
          lock_ttl_minutes?: number
          max_attempts?: number
          max_reprocess_attempts?: number
          mode?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_cost_summary: {
        Row: {
          last_used_at: string | null
          pages: number | null
          requests: number | null
          service: string | null
          tokens_input: number | null
          tokens_output: number | null
          total_cost: number | null
          total_logs: number | null
        }
        Relationships: []
      }
      folder_deferred_status: {
        Row: {
          company_id: string | null
          done_count: number | null
          earliest_eta: string | null
          failed_count: number | null
          folder_path: string | null
          in_batch_count: number | null
          latest_eta: string | null
          rma_id: string | null
          total_count: number | null
        }
        Relationships: []
      }
      folder_processing_status: {
        Row: {
          chunk_count: number | null
          company_id: string | null
          done_count: number | null
          failed_count: number | null
          folder_path: string | null
          last_activity_at: string | null
          pending_count: number | null
          processing_count: number | null
          rate_limit_until: string | null
          rate_limited_count: number | null
          rma_id: string | null
          total_count: number | null
        }
        Relationships: []
      }
      onedrive_incremental_metrics: {
        Row: {
          avg_duration_ms: number | null
          company_id: string | null
          last_scan_at: string | null
          reprocess_rate_pct: number | null
          total_files_scanned: number | null
          total_ignored: number | null
          total_inactive: number | null
          total_new: number | null
          total_scans: number | null
          total_updated: number | null
        }
        Relationships: []
      }
      vw_export_agcs_realizadas: {
        Row: {
          ano: number | null
          cidade: string | null
          cliente: string | null
          data_agc: string | null
          estado: string | null
          mes: string | null
          recuperanda: string | null
          source_id: string | null
          source_updated_at: string | null
        }
        Relationships: []
      }
      vw_export_aj_nomeados: {
        Row: {
          aj_nomeado: string | null
          data_distribuicao: string | null
          empresa: string | null
          magistrado_nome: string | null
          mes_distribuicao: string | null
          numero_processo: string | null
          source_id: string | null
          source_updated_at: string | null
          uf: string | null
          valor_passivo: number | null
          vara_comarca: string | null
        }
        Relationships: []
      }
      vw_export_cadastro_aj: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          contato: string | null
          email: string | null
          endereco: string | null
          nome: string | null
          numero: string | null
          sigla: string | null
          source_id: string | null
          source_updated_at: string | null
          telefone: string | null
          uf: string | null
        }
        Relationships: []
      }
      vw_export_cartas_aj: {
        Row: {
          ano: number | null
          cliente: string | null
          contato: string | null
          data_distribuicao: string | null
          data_impressao: string | null
          dia: number | null
          dias_120: string | null
          dias_150: string | null
          dias_90: string | null
          mes: string | null
          processo: string | null
          sep1: string | null
          sep2: string | null
          sigla: string | null
          source_id: string | null
          source_updated_at: string | null
          status: string | null
        }
        Relationships: []
      }
      vw_training_pending: {
        Row: {
          agent: string | null
          classe: string | null
          created_at: string | null
          document_id: string | null
          extracted_data: Json | null
          extraction_id: string | null
          file_name: string | null
          final_confidence: number | null
          mime_type: string | null
          normalized_text: string | null
          path: string | null
          rma_id: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_rma_analysis_lock: {
        Args: {
          p_company_id: string
          p_force?: boolean
          p_holder?: string
          p_ttl_minutes?: number
        }
        Returns: Json
      }
      ai_cost_diagnostics: { Args: never; Returns: Json }
      ai_cost_should_pause: { Args: never; Returns: Json }
      archive_failed_job: { Args: { p_queue_id: string }; Returns: string }
      auto_retry_failed_rma_runs: {
        Args: {
          p_anon_key: string
          p_batch_limit?: number
          p_cooldown_minutes?: number
          p_function_url: string
          p_max_retries?: number
        }
        Returns: {
          out_company_id: string
          out_request_id: number
          out_retry_attempt: number
        }[]
      }
      block_rate_limit: {
        Args: {
          p_model: string
          p_provider: string
          p_reason?: string
          p_retry_after_ms: number
        }
        Returns: undefined
      }
      boost_recurring_single_failures: {
        Args: { p_min_priority?: number }
        Returns: number
      }
      bump_llm_cache_hit: { Args: { p_hash: string }; Returns: undefined }
      calculate_ai_cost: {
        Args: {
          p_pages: number
          p_requests: number
          p_service: string
          p_tokens_input: number
          p_tokens_output: number
        }
        Returns: number
      }
      can_access_company: { Args: { p_company_id: string }; Returns: boolean }
      can_access_company_by_rma: {
        Args: { p_rma_id: string }
        Returns: boolean
      }
      can_access_rma_doc: { Args: { p_document_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: { p_model: string; p_provider: string }
        Returns: Json
      }
      claim_processing_jobs: {
        Args: {
          p_batch_size?: number
          p_lock_minutes?: number
          p_worker_id: string
        }
        Returns: {
          ano: number | null
          attempts: number
          batch_id: string | null
          block_reason: string | null
          chunk_index: number | null
          chunk_payload: Json | null
          chunks_total: number | null
          company_id: string | null
          created_at: string
          error_message: string | null
          file_id: string
          finished_at: string | null
          id: string
          lock_until: string | null
          locked_by: string | null
          max_attempts: number
          mes: number | null
          next_attempt_at: string
          parent_job_id: string | null
          payload: Json | null
          picked_at: string | null
          priority: number
          processing_mode: string
          reason: string
          rma_id: string | null
          status: string
          trigger_source: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "processing_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_stuck_jobs: { Args: { p_stuck_minutes?: number }; Returns: Json }
      complete_processing_job: {
        Args: { p_job_id: string; p_payload?: Json }
        Returns: {
          ano: number | null
          attempts: number
          batch_id: string | null
          block_reason: string | null
          chunk_index: number | null
          chunk_payload: Json | null
          chunks_total: number | null
          company_id: string | null
          created_at: string
          error_message: string | null
          file_id: string
          finished_at: string | null
          id: string
          lock_until: string | null
          locked_by: string | null
          max_attempts: number
          mes: number | null
          next_attempt_at: string
          parent_job_id: string | null
          payload: Json | null
          picked_at: string | null
          priority: number
          processing_mode: string
          reason: string
          rma_id: string | null
          status: string
          trigger_source: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "processing_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consolidate_rma_document: {
        Args: { p_document_id: string }
        Returns: {
          arquivo_final_gerado_em: string | null
          arquivo_final_pct: number
          arquivo_final_url: string | null
          arquivo_final_versao: number
          created_at: string
          created_by: string | null
          executive_summary: Json | null
          finalizado_at: string | null
          health_score: number | null
          id: string
          metadata: Json
          progresso: number
          released_to_recuperanda_at: string | null
          released_to_recuperanda_by: string | null
          released_to_recuperanda_notes: string | null
          risk_global: string | null
          rma_id: string
          status: string
          template_id: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "rma_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_rate_limit: {
        Args: { p_model: string; p_provider: string; p_tokens?: number }
        Returns: undefined
      }
      correlate_processed_files: {
        Args: { p_min_quality?: number }
        Returns: Json
      }
      current_primary_role: { Args: never; Returns: string }
      degrade_agent_profile_on_error: {
        Args: {
          p_agent_name: string
          p_extra_examples?: number
          p_step?: number
        }
        Returns: {
          agent_name: string
          created_at: string
          last_validated_at: string | null
          max_examples: number
          max_tokens: number
          notes: string | null
          priority_model: string
          quality_score: number
          require_validation: boolean
          similarity_threshold: number
          strict_mode: boolean
          temperature: number
          updated_at: string
          use_path_context: boolean
          use_structured_context: boolean
          validation_count: number
        }
        SetofOptions: {
          from: "*"
          to: "agent_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_file_delta: {
        Args: {
          p_etag: string
          p_file_id: string
          p_hash: string
          p_last_modified: string
        }
        Returns: string
      }
      detect_outliers_by_classe: {
        Args: {
          candidate_value: number
          field_path: string
          target_classe: string
        }
        Returns: {
          mean: number
          sample_count: number
          stddev: number
          z_score: number
        }[]
      }
      enqueue_deferred_job: {
        Args: {
          p_company_id: string
          p_document_id?: string
          p_file_id: string
          p_file_name: string
          p_folder_path: string
          p_mime_type: string
          p_pages: number
          p_payload?: Json
          p_rma_id: string
          p_size_bytes: number
        }
        Returns: string
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      extend_rma_analysis_lock: {
        Args: { p_company_id: string; p_token: string; p_ttl_minutes?: number }
        Returns: boolean
      }
      fail_processing_job: {
        Args: {
          p_block_reason?: string
          p_error_message: string
          p_job_id: string
          p_retry_after_ms?: number
        }
        Returns: {
          ano: number | null
          attempts: number
          batch_id: string | null
          block_reason: string | null
          chunk_index: number | null
          chunk_payload: Json | null
          chunks_total: number | null
          company_id: string | null
          created_at: string
          error_message: string | null
          file_id: string
          finished_at: string | null
          id: string
          lock_until: string | null
          locked_by: string | null
          max_attempts: number
          mes: number | null
          next_attempt_at: string
          parent_job_id: string | null
          payload: Json | null
          picked_at: string | null
          priority: number
          processing_mode: string
          reason: string
          rma_id: string | null
          status: string
          trigger_source: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "processing_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admjudicial_for_recuperanda: {
        Args: { _recuperanda_user_id: string }
        Returns: boolean
      }
      is_company_released_to_user: {
        Args: { _company_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      learn_prompt_example: {
        Args: {
          p_agent?: string
          p_classe: string
          p_input_text: string
          p_output_json: Json
          p_validated_id?: string
          p_weight?: number
        }
        Returns: string
      }
      log_platform_event: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_company_id?: string
          p_conversation_id?: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_rma_id?: string
          p_summary?: string
        }
        Returns: string
      }
      mark_conversation_notifications_read: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      mark_file_manual_upload_required: {
        Args: { p_file_id: string; p_reason: string }
        Returns: undefined
      }
      mark_missing_files_inactive: {
        Args: {
          p_company_id: string
          p_folder_prefix: string
          p_rma_id: string
          p_scan_id: string
        }
        Returns: number
      }
      match_company_memory: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_company_id: string
        }
        Returns: {
          conteudo: string
          id: string
          similarity: number
          tipo: string
          weight: number
        }[]
      }
      match_document_pattern: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_company_id?: string
          target_tipo: string
        }
        Returns: {
          confidence: number
          fornecedor: string
          id: string
          layout_label: string
          schema_detectado: Json
          similarity: number
          weight: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_off_peak_at: { Args: { p_from?: string }; Returns: string }
      pdf_split_increment_done: {
        Args: { p_parent_file_id: string }
        Returns: {
          chunks_done: number
          company_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          merged_extraction_id: string | null
          parent_deferred_job_id: string | null
          parent_document_id: string | null
          parent_file_id: string
          rma_id: string | null
          status: string
          total_chunks: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pdf_split_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reinforce_company_memory: {
        Args: { p_memory_id: string; p_success: boolean }
        Returns: number
      }
      release_rma_analysis_lock: {
        Args: { p_company_id: string; p_token: string }
        Returns: boolean
      }
      requeue_failed_job: {
        Args: { p_failed_id: string; p_reset_attempts?: boolean }
        Returns: string
      }
      requeue_rate_limited_jobs: { Args: never; Returns: number }
      rma_document_bump_version: {
        Args: { p_document_id: string }
        Returns: number
      }
      rma_document_progress: {
        Args: { p_document_id: string }
        Returns: {
          ok: number
          pct: number
          total: number
        }[]
      }
      sanitize_stuck_rma_runs: {
        Args: { p_max_minutes?: number }
        Returns: {
          files_released: number
          runs_reset: number
        }[]
      }
      search_documents: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_rma_id: string
        }
        Returns: {
          chunk_text: string
          document_id: string
          similarity: number
        }[]
      }
      search_ocr_embeddings: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_classe?: string
          target_rma_id?: string
        }
        Returns: {
          classe: string
          document_id: string
          id: string
          rma_id: string
          similarity: number
          text: string
        }[]
      }
      search_prompt_examples: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_classe: string
        }
        Returns: {
          id: string
          input_text: string
          output_json: Json
          similarity: number
          weight: number
        }[]
      }
      search_prompt_examples_by_path: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_classe: string
          target_path?: string
        }
        Returns: {
          id: string
          input_text: string
          output_json: Json
          path: string
          similarity: number
          weight: number
        }[]
      }
      set_rma_document_recuperanda_release: {
        Args: { p_document_id: string; p_notes?: string; p_release: boolean }
        Returns: {
          arquivo_final_gerado_em: string | null
          arquivo_final_pct: number
          arquivo_final_url: string | null
          arquivo_final_versao: number
          created_at: string
          created_by: string | null
          executive_summary: Json | null
          finalizado_at: string | null
          health_score: number | null
          id: string
          metadata: Json
          progresso: number
          released_to_recuperanda_at: string | null
          released_to_recuperanda_by: string | null
          released_to_recuperanda_notes: string | null
          risk_global: string | null
          rma_id: string
          status: string
          template_id: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "rma_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_worker_mode: {
        Args: { p_mode: string }
        Returns: {
          batch_size: number
          cron_interval_seconds: number
          enabled: boolean
          id: string
          last_run_at: string | null
          last_run_summary: Json | null
          lock_ttl_minutes: number
          max_attempts: number
          max_reprocess_attempts: number
          mode: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      should_defer_file: {
        Args: { p_pages?: number; p_size_bytes: number }
        Returns: boolean
      }
      transition_rma_section_status: {
        Args: { p_motivo?: string; p_new_status: string; p_section_id: string }
        Returns: {
          analise_ia: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          assigned_to: string | null
          chart_meta: Json
          concluido_em: string | null
          concluido_por: string | null
          conclusao_ia: Json | null
          conteudo_editado: string | null
          conteudo_ia: string | null
          created_at: string
          custo_ia: number | null
          dados_extraidos: Json | null
          dados_origem: Json
          document_id: string
          enviado_revisao_em: string | null
          enviado_revisao_por: string | null
          graficos_ids: Json
          grounding_score: number
          id: string
          insights: Json | null
          kpis: Json
          motivo_devolucao: string | null
          numero: string | null
          ordem: number
          parent_id: string | null
          prompt_contexto: string | null
          reaberto_em: string | null
          reaberto_motivo: string | null
          reaberto_por: string | null
          regen_count: number
          risco: string | null
          risk_score: number | null
          status: string
          titulo: string
          tokens_usados: number | null
          ungrounded_claims: Json
          updated_at: string
          updated_by: string | null
          validacao: Json | null
          versao_atual: number
        }
        SetofOptions: {
          from: "*"
          to: "rma_document_sections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_prompt_example_weight: {
        Args: { example_id: string; success: boolean }
        Returns: {
          id: string
          success_count: number
          usage_count: number
          weight: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "coordenador"
        | "consultor"
        | "magistrado"
        | "recuperanda"
        | "gestor_ia"
        | "admjudicial"
      export_status:
        | "AVAILABLE"
        | "OUTDATED"
        | "GENERATING"
        | "SUCCESS"
        | "ERROR"
        | "NO_DATA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "coordenador",
        "consultor",
        "magistrado",
        "recuperanda",
        "gestor_ia",
        "admjudicial",
      ],
      export_status: [
        "AVAILABLE",
        "OUTDATED",
        "GENERATING",
        "SUCCESS",
        "ERROR",
        "NO_DATA",
      ],
    },
  },
} as const
