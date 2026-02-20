// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginData {
  email: string
  password: string
}

// ─── Client (fan/subscriber) ─────────────────────────────────────────────────

export interface Client {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  username: string | null
  is_online: boolean
  date_birth: string | null
}

// ─── Creator ─────────────────────────────────────────────────────────────────

export interface CreatorDescription {
  id: string
  profile_id: string
  bio: string | null
  category: string | null
  tags: string[]
}

export interface CreatorImage {
  id: string
  url: string
  type: 'photo' | 'video'
  is_locked: boolean
  created_at: string
}

export interface CreatorDocument {
  id: string
  url: string
  type: string
  verified: boolean
}

export interface ProximaLive {
  id: string
  title: string
  scheduled_at: string
  price: number | null
}

export interface Notifications {
  unread_count: number
  last_seen_at: string | null
}

export interface Creator {
  id: string
  nome: string
  status: string | null
  foto_perfil: string | null
  data_criacao: string
  live_hoje: boolean
  live_horario: string | null
  vende_conteudo: boolean
  quantidade_likes: number
  faz_encontro_presencial: boolean
  valor_1_hora: number
  valor_30_min: number
  faz_chamada_video: boolean
  genero: string | null
  descricao: CreatorDescription | null
  imagens: CreatorImage[]
  documents: CreatorDocument[]
  proxima_live: ProximaLive | null
  curtiu: boolean
  notificacoes: Notifications | null
  favorito: boolean
}

// ─── Profile (database row) ───────────────────────────────────────────────────

export interface Profile {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  email: string | null
  date_birth: string | null
  role: 'consumer' | 'creator' | null
  is_active: boolean
  is_creator: boolean
  is_online: boolean
  created_at: string
  updated_at: string
}

// ─── Packs ───────────────────────────────────────────────────────────────────

export interface PackItem {
  id: string
  pack_id: string
  title: string
  description: string | null
  media_url: string | null
  media_type: 'image' | 'video' | 'audio'
  is_locked: boolean
}

export interface Pack {
  id: string
  creator_id: string
  title: string
  description: string | null
  price: number
  cover_url: string | null
  items: PackItem[]
  created_at: string
}

export interface PackInfo {
  id: string
  title: string
  price: number
  cover_url: string | null
  items_count: number
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  img_url: string | null
  store_name: string | null
  description: string | null
  valid_from: string | null
  valid_until: string | null
}

// ─── Conversations & Messages ─────────────────────────────────────────────────

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  media_url: string | null
  media_type: 'image' | 'video' | 'audio' | null
  is_read: boolean
  created_at: string
}

export interface Conversation {
  id: string
  creator_id: string
  client_id: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  creator: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'is_online'>
  client: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
}

// ─── Live Streams ─────────────────────────────────────────────────────────────

export interface LiveStream {
  id: string
  creator_id: string
  title: string
  description: string | null
  scheduled_start_time: string
  actual_start_time: string | null
  actual_end_time: string | null
  ticket_price: number | null
  currency: string
  status: 'scheduled' | 'live' | 'ended'
  stream_url: string | null
  cover_image_url: string | null
  estimated_duration_minutes: number | null
  participant_limit: number | null
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export interface OneOnOneCall {
  id: string
  creator_id: string
  client_id: string
  scheduled_at: string
  duration_minutes: number
  price: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes: string | null
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface SubscriptionPlan {
  id: string
  creator_id: string
  name: string
  price: number
  interval: 'monthly' | 'yearly'
  benefits: string[]
  is_active: boolean
}

export interface CreatorSubscription {
  id: string
  plan_id: string
  client_id: string
  creator_id: string
  status: 'active' | 'cancelled' | 'expired'
  started_at: string
  expires_at: string | null
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: string
  user_id: string
  amount: number
  type: 'purchase' | 'subscription' | 'call' | 'live' | 'refund'
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  reference_id: string | null
  created_at: string
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface AppNotification {
  id: string
  user_id: string
  title: string
  body: string
  type: 'success' | 'warning' | 'error' | 'info'
  is_read: boolean
  created_at: string
}

// ─── Availability ─────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  id: string
  creator_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_available: boolean
}

// ─── Enums ───────────────────────────────────────────────────────────────────

export type NavPage =
  | 'home'
  | 'agenda'
  | 'chat'
  | 'notifications'
  | 'profile'
  | 'content'
  | 'coupons'
  | 'events'
  | 'favorites'
  | 'empty'

export type EventType = 'live' | 'call'

export type NotificationType = 'success' | 'warning' | 'error' | 'info'
