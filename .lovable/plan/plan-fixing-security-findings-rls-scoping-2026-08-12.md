# Plan - Fixing Security Findings (RLS & Scoping)

The goal is to address the high-priority security findings identified in the scan, focusing on Cross-tenant/scoping issues in Row Level Security (RLS) policies.

## Proposed Changes

### Database & RLS Scoping

- **Knowledge Base Scoping**:
    - Update policies for `knowledge_entities`, `knowledge_entity_versions`, `knowledge_relations`, `knowledge_events`, `knowledge_commercial`, and `knowledge_sources`.
    - Instead of `USING (true)`, scope access to users who have a role (e.g., `authenticated`) AND potentially check for assignment if business logic requires it.
    - *Correction*: The scan suggests scoping to "assigned companies or role-based access". Since these are "Knowledge Base" tables likely used by `gestor_ia` and `coordenador` for prospecting, we will restrict `SELECT` to these roles or `authenticated` with an assignment check where possible.

- **Prospecção Business Facts Scoping**:
    - Update `pbf_read_authenticated` on `prospeccao_business_facts`.
    - Join with `prospeccao_linhas` (or similar assignment table) to ensure the user only sees facts for companies they are authorized to view.

- **Judicial Correspondence (Letters) Scoping**:
    - Update `letters_select_authenticated`, `letters_insert_authenticated`, and `letters_update_authenticated`.
    - Scope access based on the `aj_id` (Administrador Judicial ID) or related company assignment.

- **Document Registry Scoping**:
    - Update `prospeccao_document_registry` policies to restrict metadata access to users with access to the related process/company.

- **Telemetry & Logs Scoping**:
    - Restrict `processing_telemetry` and `export_runs`/`export_downloads` to the owner (`user_id`) or admin roles.

- **Analytics Scoping**:
    - Add ownership checks to `prospeccao_analytics`.

### Function & View Security

- **Security Definer Functions**:
    - Ensure `search_path` is set to `public` for all `SECURITY DEFINER` functions to prevent path hijacking.
    - Review `EXECUTE` grants to ensure `anon` cannot call sensitive functions.
- **Security Definer Views**:
    - Convert to `SECURITY INVOKER` where possible or ensure the underlying data is correctly scoped.

## Technical Details

- **Helper Functions**: Use the existing `public.has_role(auth.uid(), 'role_name')` function for role-based checks.
- **Assignment Logic**: Leverage `public.can_access_company(user_id, company_id)` if such a function exists, otherwise implement a standardized check against the assignment tables (`prospeccao_assignment_history`).
- **Migration**: Create a new migration file `supabase/migrations/20260812000000_fix_security_scoping.sql` to apply these fixes.

## Verification Plan

- **Manual Verification**: Test different user roles (Consultor, Coordenador, Gestor IA) to ensure they can only see their own data.
- **Linter Check**: Run the Supabase Linter after migration to confirm issues are resolved.
