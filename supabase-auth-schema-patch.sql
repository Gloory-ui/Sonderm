-- Выполните в Supabase SQL Editor при необходимости (если ещё не сделано)

-- Уникальный username
DO $$
BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Email в профиле (дублирует auth.users.email для удобства / RLS)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- Разрешить анонимную проверку «свободен ли username» (только факт существования)
-- Вариант A: отдельная RPC (предпочтительно) — создайте функцию is_username_taken и вызывайте с клиента
-- Вариант B: политика на чтение profiles для anon — осторожно с приватностью
-- Сейчас проверка идёт через ваш Node-сервер с service_role, клиент к profiles для этого не ходит.
