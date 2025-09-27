-- Minimal setup to get basic chat working
-- Run this in your Supabase SQL Editor

-- 1. Create default rooms
INSERT INTO chat_rooms (id, name, description, is_private, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'General', 'Welcome to the general chat room!', false, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002', 'College', 'College discussion room', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- 2. Check if rooms were created
SELECT id, name, description FROM chat_rooms ORDER BY created_at;
