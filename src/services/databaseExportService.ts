import { supabase } from "@/integrations/supabase/client";

export type ExportStatus = 'AVAILABLE' | 'OUTDATED' | 'GENERATING' | 'SUCCESS' | 'ERROR' | 'NO_DATA';

export interface ExportDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ExportStatus;
  record_count: number;
  last_updated_at: string | null;
  updated_by_name: string | null;
  last_download_at: string | null;
}

export interface ExportRun {
  id: string;
  export_definition_id: string;
  status: ExportStatus;
  started_at: string;
  finished_at: string | null;
  record_count: number;
  file_name: string | null;
  error_message: string | null;
}

export const databaseExportService = {
  async getDefinitions(): Promise<ExportDefinition[]> {
    const { data: defs, error: defsError } = await supabase
      .from('export_definitions')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (defsError) throw defsError;

    const { data: runs, error: runsError } = await supabase
      .from('export_runs')
      .select('id, export_definition_id, status, finished_at, record_count, requested_by')
      .order('created_at', { ascending: false });

    if (runsError) throw runsError;

    const { data: downloads, error: downloadsError } = await supabase
      .from('export_downloads')
      .select('export_run_id, downloaded_at')
      .order('downloaded_at', { ascending: false });

    if (downloadsError) throw downloadsError;

    // Join data manually since we want latest per definition
    return defs.map(def => {
      const latestRun = runs.find(r => r.export_definition_id === def.id);
      const latestDownload = latestRun 
        ? downloads.find(d => d.export_run_id === latestRun.id)
        : null;

      return {
        id: def.id,
        code: def.code,
        name: def.name,
        description: def.description || '',
        status: latestRun?.status || 'NO_DATA',
        record_count: latestRun?.record_count || 0,
        last_updated_at: latestRun?.finished_at || null,
        updated_by_name: null, // Would need profile join
        last_download_at: latestDownload?.downloaded_at || null,
      };
    });
  },

  async generateExport(code: string): Promise<string> {
    const { data: def, error: defError } = await supabase
      .from('export_definitions')
      .select('id')
      .eq('code', code)
      .single();

    if (defError) throw defError;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Not authenticated");

    const { data: run, error: runError } = await supabase
      .from('export_runs')
      .insert({
        export_definition_id: def.id,
        requested_by: userData.user.id,
        status: 'GENERATING'
      })
      .select()
      .single();

    if (runError) throw runError;

    // In a real implementation, this would trigger an Edge Function.
    // For now, we simulate success for the UI implementation.
    console.log(`Triggering export generation for ${code}, run ID: ${run.id}`);
    
    return run.id;
  },

  async downloadLatest(code: string): Promise<void> {
    const { data: def, error: defError } = await supabase
      .from('export_definitions')
      .select('id')
      .eq('code', code)
      .single();

    if (defError) throw defError;

    const { data: latestRun, error: runError } = await supabase
      .from('export_runs')
      .select('id, file_name, file_path')
      .eq('export_definition_id', def.id)
      .eq('status', 'SUCCESS')
      .order('finished_at', { ascending: false })
      .limit(1)
      .single();

    if (runError || !latestRun) throw new Error("No valid export found");

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Not authenticated");

    await supabase.from('export_downloads').insert({
      export_run_id: latestRun.id,
      downloaded_by: userData.user.id
    });

    // Handle actual file download here using supabase.storage if file_path exists
    console.log(`Downloading file: ${latestRun.file_name}`);
  }
};
