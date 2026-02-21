-- BUG-007: Fix creator_subscriptions unique constraint
-- The table stores client-to-creator subscriptions (many clients per creator).
-- The old unique constraint on creator_id alone prevented multiple clients
-- from subscribing to the same creator.

-- Drop the old unique constraint on creator_id (if it exists)
DO $$
BEGIN
  -- Try to drop the constraint by known name patterns
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'creator_subscriptions'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 1
      AND conkey[1] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'creator_subscriptions'::regclass
          AND attname = 'creator_id'
      )
  ) THEN
    -- Find and drop the single-column unique constraint on creator_id
    EXECUTE (
      SELECT 'ALTER TABLE creator_subscriptions DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'creator_subscriptions'::regclass
        AND contype = 'u'
        AND array_length(conkey, 1) = 1
        AND conkey[1] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = 'creator_subscriptions'::regclass
            AND attname = 'creator_id'
        )
      LIMIT 1
    );
  END IF;
END $$;

-- Add composite unique constraint on (client_id, creator_id)
ALTER TABLE creator_subscriptions
  ADD CONSTRAINT creator_subscriptions_client_creator_unique
  UNIQUE (client_id, creator_id);
