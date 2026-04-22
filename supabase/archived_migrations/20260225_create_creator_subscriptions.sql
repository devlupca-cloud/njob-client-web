-- Create creator_subscriptions table
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  gateway_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'pending', 'past_due', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, creator_id)
);

-- RLS
ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read subscriptions they are part of
CREATE POLICY "Users can view own subscriptions"
  ON creator_subscriptions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = creator_id OR auth.uid() = client_id
  );

-- Service role handles inserts/updates via webhooks
-- Allow authenticated users to read counts (head requests)
CREATE POLICY "Authenticated can count subscriptions"
  ON creator_subscriptions FOR SELECT
  TO authenticated
  USING (true);
