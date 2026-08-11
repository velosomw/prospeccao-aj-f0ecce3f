import { supabase as baseSupabase } from "@/integrations/supabase/client";

export const supabase = new Proxy(baseSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from' || prop === 'rpc') {
      return (...args: any[]) => (target as any)[prop](...args) as any;
    }
    return Reflect.get(target, prop, receiver);
  }
}) as any;
