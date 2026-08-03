import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoleList = (callerRoles || []).map((r: any) => r.role);
    const isGestor = callerRoleList.includes("gestor_ia");
    const isCoordenador = callerRoleList.includes("coordenador");
    const isConsultor = callerRoleList.includes("consultor");
    const isAdmjudicial = callerRoleList.includes("admjudicial");
    const isMagistrado = callerRoleList.includes("magistrado");

    const body = await req.json();
    const { action } = body;

    // Consultor e Magistrado podem apenas listar (para selecionar consultores em atribuições ou ver processos)
    if (!isGestor && !isCoordenador && !isAdmjudicial && !isMagistrado && !(isConsultor && action === "list")) {
      return new Response(JSON.stringify({ error: "Sem permissão para gerenciar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LIST USERS
    if (action === "list") {
      const { data: profiles, error } = await adminClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: allRoles, error: rolesError } = await adminClient
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const rolesByUser = new Map<string, string[]>();
      (allRoles || []).forEach((r: any) => {
        const list = rolesByUser.get(r.user_id) || [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      });

      let merged = (profiles || []).map((p: any) => ({
        ...p,
        user_roles: (rolesByUser.get(p.user_id) || []).map((role) => ({ role })),
      }));

      if ((isConsultor || isMagistrado) && !isGestor && !isCoordenador && !isAdmjudicial) {
        merged = merged.filter((p: any) => {
          const roles = (p.user_roles || []).map((r: any) => r.role);
          return roles.includes("consultor") || roles.includes("magistrado");
        });
      } else if (isAdmjudicial && !isGestor && !isCoordenador) {
        // Admjudicial vê apenas Empresas Prospecção vinculadas a si
        const { data: links } = await adminClient
          .from("admjudicial_recuperandas")
          .select("recuperanda_user_id")
          .eq("admjudicial_user_id", caller.id);
        const allowed = new Set((links || []).map((l: any) => l.recuperanda_user_id));
        merged = merged.filter((p: any) => {
          const roles = (p.user_roles || []).map((r: any) => r.role);
          return roles.includes("recuperanda") && allowed.has(p.user_id);
        });
      } else if (isCoordenador && !isGestor) {
        merged = merged.filter((p: any) => {
          const roles = (p.user_roles || []).map((r: any) => r.role);
          return roles.some((r: string) => ["consultor", "magistrado", "recuperanda", "admjudicial"].includes(r));
        });
      }

      return new Response(JSON.stringify({ profiles: merged }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE USER
    if (action === "create") {
      const { email, password, full_name, role } = body;

      if (!email || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: "Campos obrigatórios: email, password, full_name, role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedRoles: Record<string, string[]> = {
        gestor_ia: ["coordenador", "admjudicial", "consultor", "magistrado", "recuperanda"],
        coordenador: ["consultor", "magistrado", "recuperanda", "admjudicial"],
        admjudicial: ["recuperanda"],
        consultor: ["admjudicial", "recuperanda", "magistrado", "consultor"],
      };

      const callerRole = isGestor ? "gestor_ia" : isCoordenador ? "coordenador" : isAdmjudicial ? "admjudicial" : "consultor";
      if (!allowedRoles[callerRole]?.includes(role)) {
        return new Response(JSON.stringify({ error: `Você não pode cadastrar o perfil: ${role}` }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient
        .from("profiles")
        .update({ role, full_name })
        .eq("user_id", newUser.user.id);

      await adminClient
        .from("user_roles")
        .insert({ user_id: newUser.user.id, role });

      // Auto-vincula Recuperanda ao Admjudicial criador
      if (isAdmjudicial && role === "recuperanda") {
        await adminClient
          .from("admjudicial_recuperandas")
          .insert({
            admjudicial_user_id: caller.id,
            recuperanda_user_id: newUser.user.id,
            created_by: caller.id,
          });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LINK / UNLINK ADMJUDICIAL <-> RECUPERANDA
    if (action === "link_admjudicial") {
      const { admjudicial_user_id, recuperanda_user_id } = body;
      if (!isGestor && !isCoordenador) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient
        .from("admjudicial_recuperandas")
        .insert({ admjudicial_user_id, recuperanda_user_id, created_by: caller.id });
      if (error && !String(error.message).includes("duplicate")) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unlink_admjudicial") {
      const { admjudicial_user_id, recuperanda_user_id } = body;
      if (!isGestor && !isCoordenador) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient
        .from("admjudicial_recuperandas")
        .delete()
        .eq("admjudicial_user_id", admjudicial_user_id)
        .eq("recuperanda_user_id", recuperanda_user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_admjudicial_links") {
      const { data, error } = await adminClient
        .from("admjudicial_recuperandas")
        .select("*");
      if (error) throw error;
      return new Response(JSON.stringify({ links: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE USER
    if (action === "update") {
      const { user_id, full_name, active, role } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: any = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (active !== undefined) updates.active = active;
      if (role !== undefined) updates.role = role;

      const { error } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("user_id", user_id);

      if (error) throw error;

      if (role) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
        await adminClient.from("user_roles").insert({ user_id, role });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE USER
    if (action === "delete") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow deleting yourself
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Você não pode excluir a si mesmo" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete user_roles, profile, then auth user
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RESET PASSWORD
    if (action === "reset_password") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "Email obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
