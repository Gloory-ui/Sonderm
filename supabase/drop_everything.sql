-- Удаление всех таблиц в схеме public (кроме системных)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chat_participants CASCADE;
DROP TABLE IF EXISTS public.chats CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Удаление функций
DROP FUNCTION IF EXISTS public.update_last_seen CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

-- Удаление триггеров (если остались)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

COMMIT;
