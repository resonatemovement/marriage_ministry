import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface CampusListItem {
  id: string;
  name: string;
  code: string;
  active: boolean;
  updatedAt: string;
}

export async function getCampusList(): Promise<CampusListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("campuses").select("id,name,code,active,updated_at").order("active", { ascending: false }).order("name");
  if (error) throw new Error("Campus lookup data is unavailable");
  return (data ?? []).map((campus) => ({ id: campus.id, name: campus.name, code: campus.code, active: campus.active, updatedAt: campus.updated_at }));
}
