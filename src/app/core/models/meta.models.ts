/** Row from meta_ad_lifecycle view */
export interface AdLifecycle {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  date: string;
  ad_day: number;
  spend: number;
  purchases: number;
  revenue: number;
  roas_daily: number;
  roas_cum: number;
  roas_7d: number;
  frequency: number;
  frequency_7d: number;
  cpa: number;
  ctr: number;
  impressions: number;
  clicks: number;
  matured: boolean;
  attribution_window: string;
}

/** Row from meta_floor_compliance view */
export interface FloorCompliance {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  date: string;
  spend: number;
  spend_cum: number;
  purchases: number;
  purchases_cum: number;
  roas_7d: number;
  roas_cum: number;
  roas_diff: number;
  consecutive_below: number;
  frequency_7d: number;
  spend_excess: number;
  matured: boolean;
  attribution_window: string;
}

/** Row from meta_ads_insights_daily */
export interface InsightDaily {
  ad_id: string;
  date: string;
  attribution_window: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  frequency: number;
  snapshot_date: string;
}

/** Row from meta_maturation_observed */
export interface MaturationObserved {
  age_days: number;
  days_compared: number;
  days_changed: number;
  avg_change_pct: number;
  max_change_pct: number;
}

/** Row from meta_ads_dim */
export interface AdDim {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_name: string;
  creative_base: string;
  status: string;
  valid_from: string;
  valid_to: string | null;
}

/** Row from meta_ads_sync_runs */
export interface SyncRun {
  id: number;
  started_at: string;
  finished_at: string;
  status: string;
  mode: string;
  rows_written: number;
  api_calls: number;
  usage_pct: number;
  dim_changes: number;
  error_message: string | null;
}

/** Row from meta_api_budget */
export interface ApiBudget {
  date: string;
  total_calls: number;
  peak_usage_pct: number;
  runs: number;
}

/** Row from meta_campaigns */
export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  objective: string;
  is_cbo: boolean;
  bid_strategy: string;
  role: string | null;
  role_confirmed: boolean;
}
