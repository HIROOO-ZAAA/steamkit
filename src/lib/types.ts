export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  stream_title: string | null;
  role: "creator" | "admin";
  created_at: string;
}

export interface TipSettings {
  id: string;
  user_id: string;
  min_tip_amount: number;
  currency: string;
  suggested_amounts: number[];
  custom_thank_you: string;
  created_at: string;
}

export type TipPaymentMethod = "aba_payway" | "bakong";

export interface CreatorTipSettings {
  id: string;
  creator_id: string;
  is_active: boolean;
  min_amount_usd: number;
  min_amount_khr: number;
  created_at: string;
  updated_at: string | null;
  // Added by supabase/migrations/20261016000000_tip_page_currency_settings.sql
  usd_presets?: number[] | null;
  khr_presets?: number[] | null;
  usd_max_amount?: number | null;
  khr_max_amount?: number | null;
  usd_payment_method?: TipPaymentMethod | null;
  khr_payment_method?: TipPaymentMethod | null;
  aba_link_usd?: string | null;
  aba_link_khr?: string | null;
  bakong_id?: string | null;
  // Added by supabase/migrations/20261019000004_merchant_display_name.sql
  merchant_display_name?: string | null;
}

export interface AlertSettings {
  id: string;
  user_id: string;
  duration_seconds: number;
  sound_url: string;
  animation_type: "bounce" | "fade" | "slide" | "zoom";
  font_color: string;
  tts_enabled: boolean;
  tts_volume?: number;
  created_at: string;
}

export interface VoiceSettings {
  id: string;
  user_id: string;
  provider: string;
  voice_id: string;
  language: string;
  pitch: number;
  speed: number;
  created_at: string;
}

export interface DonationGoal {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  bar_color: string;
  is_active: boolean;
  created_at: string;
}

export interface SpinWheelSlice {
  label: string;
  color: string;
}

export interface SpinWheel {
  id: string;
  user_id: string;
  title: string;
  min_tip_to_trigger: number;
  slices: SpinWheelSlice[];
  created_at: string;
}

export interface Raffle {
  id: string;
  user_id: string;
  title: string;
  status: "open" | "closed" | "completed";
  winner_name: string | null;
  created_at: string;
}

export interface RaffleEntry {
  id: string;
  raffle_id: string;
  username: string;
  display_name: string | null;
  entries_count: number;
  created_at: string;
}

export interface Subathon {
  id: string;
  user_id: string;
  remaining_seconds: number;
  minutes_per_dollar: number;
  is_paused: boolean;
  created_at: string;
}

export interface TelegramConnection {
  id: string;
  user_id: string;
  bot_token: string | null;
  chat_id: string | null;
  is_enabled: boolean;
  created_at: string;
}

export interface SubscriptionTier {
  id: string;
  user_id: string;
  name: string;
  price: number;
  description: string | null;
  badge_color: string;
  created_at: string;
}

export type DonationPhotoStatus = "none" | "pending" | "approved" | "rejected";

export interface Tip {
  id: string;
  creator_id: string;
  tipper_name: string;
  amount: number;
  currency: string;
  message: string | null;
  payment_method: string;
  payment_status: string;
  payment_transaction_id: string | null;
  played_in_overlay: boolean;
  created_at: string;
  // Added by supabase/migrations/20261019000003_donation_photo_moderation.sql
  photo_path?: string | null;
  photo_status?: DonationPhotoStatus | null;
  // Donor voice message. Unlike a photo this is not moderated: it plays as part
  // of the alert. Added by 20261019000009_donation_voice_messages.sql.
  voice_path?: string | null;
  voice_duration_seconds?: number | null;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  theme_color: string;
  created_at: string;
  updated_at: string;
}

export interface StreamEvent {
  id: string;
  project_id: string;
  type: "donation" | "message" | "alert" | "follow" | "milestone";
  content: string;
  amount: number | null;
  sender_name: string | null;
  created_at: string;
}
