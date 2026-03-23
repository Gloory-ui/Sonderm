/* Telegram Ultimate - Supabase Client */

// Конфигурация Supabase (будет загружена с сервера)
const SUPABASE_URL = window.SUPABASE_CONFIG?.url || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || 'your-anon-key';

// Инициализация клиента Supabase
let supabaseClient = null;

/**
 * Получить или создать клиент Supabase
 */
function getSupabaseClient() {
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });
    }
    return supabaseClient;
}

/**
 * Получить текущую сессию
 */
async function getSession() {
    const supabase = getSupabaseClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
}

/**
 * Получить текущего пользователя
 */
async function getCurrentUser() {
    const { session, error } = await getSession();
    if (error || !session) return null;
    return session.user;
}

/**
 * Получить профиль пользователя
 */
async function getUserProfile(userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }
    return data;
}

/**
 * Обновить профиль пользователя
 */
async function updateProfile(updates) {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();
    
    return { data, error };
}

/**
 * Поиск пользователей
 */
async function searchUsers(query) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_online')
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(20);
    
    if (error) {
        console.error('Error searching users:', error);
        return [];
    }
    return data || [];
}

/**
 * Получить список чатов пользователя
 */
async function getUserChats() {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
        .from('chat_participants')
        .select(`
            chat_id,
            role,
            chats(
                id,
                type,
                title,
                created_at,
                chat_participants(
                    profiles(id, username, full_name, avatar_url, is_online)
                )
            )
        `)
        .eq('user_id', user.id);
    
    if (error) {
        console.error('Error fetching chats:', error);
        return [];
    }
    
    return data.map(item => ({
        ...item.chats,
        role: item.role,
        participants: item.chats.chat_participants
    })) || [];
}

/**
 * Создать новый чат
 */
async function createChat(participantIds, type = 'private', title = '') {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    // Создаем чат
    const { data: chat, error: chatError } = await supabase
        .from('chats')
        .insert({ type, title, created_by: user.id })
        .select()
        .single();
    
    if (chatError) return { error: chatError.message };
    
    // Добавляем участников
    const participants = [user.id, ...participantIds].map(id => ({
        chat_id: chat.id,
        user_id: id,
        role: id === user.id ? 'admin' : 'member'
    }));
    
    const { error: participantsError } = await supabase
        .from('chat_participants')
        .insert(participants);
    
    if (participantsError) return { error: participantsError.message };
    
    return { data: chat };
}

/**
 * Получить сообщения чата
 */
async function getChatMessages(chatId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('messages')
        .select(`
            *,
            profiles(id, username, full_name, avatar_url)
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
    
    if (error) {
        console.error('Error fetching messages:', error);
        return [];
    }
    return data || [];
}

/**
 * Отправить сообщение
 */
async function sendMessage(chatId, text, replyToId = null) {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await supabase
        .from('messages')
        .insert({
            chat_id: chatId,
            sender_id: user.id,
            text: text.trim(),
            reply_to: replyToId
        })
        .select()
        .single();
    
    if (error) {
        console.error('Error sending message:', error);
        return { error: error.message };
    }
    
    return { data };
}

/**
 * Отметить сообщения как прочитанные
 */
async function markMessagesAsRead(chatId) {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return;
    
    const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('sender_id', user.id)
        .eq('is_read', false);
    
    if (error) {
        console.error('Error marking messages as read:', error);
    }
}

/**
 * Выйти из системы
 */
async function signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
}

/**
 * Подписаться на изменения в таблице
 */
function subscribeToChanges(table, callback) {
    const supabase = getSupabaseClient();
    return supabase
        .channel(`${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table: table }, callback)
        .subscribe();
}

// Экспорт функций
globalThis.SupabaseClient = {
    getClient: getSupabaseClient,
    getSession,
    getCurrentUser,
    getUserProfile,
    updateProfile,
    searchUsers,
    getUserChats,
    createChat,
    getChatMessages,
    sendMessage,
    markMessagesAsRead,
    signOut,
    subscribeToChanges
};
