/** Row from meta_ad_lifecycle_mat */
export interface AdLifecycle {
  ad_id: string;
  date: string;
  ad_day: number;
  days_matured: number;
  matured: boolean;
  learning_phase: boolean;
  spend_day: number;
  purchases_day: number;
  frequency_day: number;
  spend_cum: number;
  purchases_cum: number;
  value_cum: number;
  roas_cum: number;
  cpa_cum: number;
  spend_7d: number;
  purchases_7d: number;
  value_7d: number;
  roas_7d: number;
  cpa_7d: number;
}

/** Row from meta_floor_compliance_mat */
export interface FloorCompliance {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  objective: string;
  is_conversion: boolean;
  is_cbo: boolean;
  campaign_role: string | null;
  effective_status: string;
  spend_7d: number;
  value_7d: number;
  roas_7d: number;
  roas_cum: number;
  frequency_day: number;
  roas_min_applied: number;
  spend_excess: number;
  compliant: boolean;
}

/** Row from meta_dashboard_mat — enriched for the dashboard */
export interface DashboardAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  effective_status: string;
  objective: string;
  compliant: boolean;
  roas_min_applied: number;
  spend_7d: number;
  value_7d: number;
  roas_7d: number;
  roas_cum: number;
  spend_excess: number;
  frequency_day: number;
  purchases_cum: number;
  purchases_7d: number;
  cpa_cum: number;
  cpa_7d: number;
  value_cum: number;
  spend_cum: number;
  aov_cum: number | null;
  aov_7d: number | null;
  ctr_7d: number;
  freq_recent: number;
  creative_id: string | null;
}

/** Row from meta_ads_daily_final view */
export interface InsightDaily {
  ad_id: string;
  date: string;
  attribution_window: string;
  snapshot_date: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchase_value: number;
  add_to_cart: number;
  initiate_checkout: number;
  days_matured: number;
}

/** Row from meta_maturation_observed view */
export interface MaturationObserved {
  edad_al_leer: number;
  observaciones: number;
  cambio_prom_pct: number;
  cambio_max_pct: number;
  dias_que_cambiaron: number;
  compras_agregadas: number;
}

/** Row from meta_ads_dim table */
export interface AdDim {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_name: string;
  creative_base: string;
  creative_id: string;
  effective_status: string;
  valid_from: string;
  valid_to: string | null;
}

/** Row from meta_ads_sync_runs table */
export interface SyncRun {
  id: number;
  started_at: string;
  finished_at: string;
  window_since: string;
  window_until: string;
  rows_upserted: number;
  status: string;
  api_calls: number;
  usage_pct: number;
  error_message: string | null;
}

/** Row from meta_api_budget view */
export interface ApiBudget {
  dia_mzt: string;
  corridas: number;
  con_error: number;
  llamadas: number;
  pico_uso_pct: number;
  bloqueo_min: number;
}
