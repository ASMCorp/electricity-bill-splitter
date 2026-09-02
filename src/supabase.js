import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

function requireClient() {
  if (!supabase) throw new Error("Supabase setup is required.");
  return supabase;
}

export const database = {
  async tariffVersions() {
    const { data, error } = await requireClient().from("tariff_versions").select("id,version,label,effective_from,slabs,created_at").order("effective_from", { ascending: false });
    if (error) throw error;
    return data;
  },
  async publishedBills() {
    const { data, error } = await requireClient().from("published_monthly_bills").select("id,bill_year,bill_month,total_bill,tariff_snapshot,calculation_snapshot,people_snapshot,published_at").order("bill_year", { ascending: false }).order("bill_month", { ascending: false });
    if (error) throw error;
    return data;
  },
  async signIn(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  },
  async session() {
    const { data, error } = await requireClient().auth.getSession();
    if (error) throw error;
    return data.session;
  },
  async isAdmin(userId) {
    const { data, error } = await requireClient().from("profiles").select("is_admin").eq("id", userId).single();
    if (error) throw error;
    return data.is_admin === true;
  },
  async drafts() {
    const { data, error } = await requireClient().from("monthly_bills").select("*").order("bill_year", { ascending: false }).order("bill_month", { ascending: false });
    if (error) throw error;
    return data;
  },
  async members() {
    const { data, error } = await requireClient().from("members").select("id,display_name,is_active,created_at,updated_at").order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },
  async createMember(payload) {
    const { data, error } = await requireClient().from("members").insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async updateMember(id, changes) {
    const { data, error } = await requireClient().from("members").update(changes).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async saveDraft(payload, id) {
    const query = id
      ? requireClient().from("monthly_bills").update(payload).eq("id", id)
      : requireClient().from("monthly_bills").insert(payload);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  },
  async setBillStatus(id, status) {
    const { data, error } = await requireClient().from("monthly_bills").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async createTariff(payload) {
    const { data, error } = await requireClient().from("tariff_versions").insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async deleteTariff(id) {
    const { data, error } = await requireClient().from("tariff_versions").delete().eq("id", id).select("id").single();
    if (error) throw error;
    return data;
  },
};
