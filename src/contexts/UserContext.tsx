import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenantId } from "@/lib/tenant";

interface UserContextType {
  role: UserRole | null;
  authenticated: boolean;
  loading: boolean;
  userEmail: string | null;
  userId: string | null;
  userName: string | null;
  setRole: (role: UserRole) => void;
  clearRole: () => void;
  login: () => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({} as UserContextType);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRoleState] = useState<UserRole | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const tenantId = useActiveTenantId();
  const queryClient = useQueryClient();

  // Profile via React Query: cache compartilhado e escopado por tenant.
  // Evita refetches duplicados entre componentes (header, dashboards, sidebar).
  const { data: profile } = useQuery({
    queryKey: ["profile", userId, tenantId],
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("user_id", userId as string)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (profile?.role) setRoleState(profile.role as UserRole);
    if (profile?.full_name) setUserName(profile.full_name);
  }, [profile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthenticated(true);
        setUserEmail(session.user.email ?? null);
        setUserId(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setAuthenticated(true);
          setUserEmail(session.user.email ?? null);
          setUserId(session.user.id);
        } else {
          // Logout / sessão invalidada: limpa todo cache para evitar
          // vazamento de dados entre usuários no mesmo browser.
          queryClient.clear();
          setAuthenticated(false);
          setRoleState(null);
          setUserEmail(null);
          setUserId(null);
          setUserName(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const setRole = useCallback((r: UserRole) => setRoleState(r), []);

  const clearRole = useCallback(() => {
    setRoleState(null);
    setAuthenticated(false);
  }, []);

  const login = useCallback(() => setAuthenticated(true), []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    setRoleState(null);
    setAuthenticated(false);
    setUserEmail(null);
    setUserId(null);
    setUserName(null);
  }, [queryClient]);

  return (
    <UserContext.Provider value={{ role, authenticated, loading, userEmail, userId, userName, setRole, clearRole, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
