-- Telegram Ultimate Clone - Инициализация базы данных

-- Таблица профилей пользователей
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE NOT NULL,
    full_name text,
    avatar_url text,
    bio text DEFAULT '',
    last_seen timestamptz DEFAULT now(),
    is_online boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Профили пользователей';

-- Таблица чатов
CREATE TABLE IF NOT EXISTS public.chats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL CHECK (type IN ('private', 'group')),
    title text,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.chats IS 'Чаты (личные и групповые)';

-- Таблица участников чатов
CREATE TABLE IF NOT EXISTS public.chat_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at timestamptz DEFAULT now(),
    UNIQUE(chat_id, user_id)
);

COMMENT ON TABLE public.chat_participants IS 'Участники чатов';

-- Таблица сообщений
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    text text NOT NULL DEFAULT '',
    media_url text,
    media_type text CHECK (media_type IN ('image', 'video', 'audio', 'file')),
    is_read boolean DEFAULT false,
    reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Сообщения в чатах';

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON public.profiles(is_online);

CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON public.chat_participants(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON public.chat_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- Функция для автоматического создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, is_online)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для создания профиля при регистрации
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Функция для обновления времени последнего посещения
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для обновления last_seen
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_last_seen();

-- Политики безопасности RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Политики для profiles
CREATE POLICY "Профили доступны всем пользователям"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Пользователи могут редактировать свой профиль"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Политики для chats
CREATE POLICY "Чаты видны участникам"
    ON public.chats FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants
            WHERE chat_id = id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Создатель может удалять чат"
    ON public.chats FOR DELETE
    USING (created_by = auth.uid());

-- Политики для chat_participants
CREATE POLICY "Участники видны участникам чата"
    ON public.chat_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants AS cp
            WHERE cp.chat_id = chat_id AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY "Участники могут добавлять других"
    ON public.chat_participants FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_participants
            WHERE chat_id = chat_participants.chat_id AND user_id = auth.uid()
        )
    );

-- Политики для messages
CREATE POLICY "Сообщения видны участникам чата"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_participants
            WHERE chat_id = messages.chat_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Участники чата могут отправлять сообщения"
    ON public.messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.chat_participants
            WHERE chat_id = messages.chat_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Отправитель может редактировать свои сообщения"
    ON public.messages FOR UPDATE
    USING (sender_id = auth.uid());

-- Предоставление прав для сервисной роли
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

COMMIT;
