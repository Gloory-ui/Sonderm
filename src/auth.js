/* Telegram Ultimate - Authentication Module */

const Auth = {
    user: null,
    profile: null,
    isAuthenticated: false,

    /**
     * Инициализация модуля авторизации
     */
    async init() {
        // Проверяем текущую сессию
        const { session, error } = await SupabaseClient.getSession();
        
        if (error || !session) {
            this.redirectToLogin();
            return false;
        }
        
        this.user = session.user;
        this.isAuthenticated = true;
        
        // Загружаем профиль пользователя
        await this.loadProfile();
        
        // Подписываемся на изменения авторизации
        this.subscribeToAuthChanges();
        
        return true;
    },

    /**
     * Загрузить профиль пользователя
     */
    async loadProfile() {
        if (!this.user) return;
        
        this.profile = await SupabaseClient.getUserProfile(this.user.id);
        
        // Обновляем UI
        this.updateUI();
    },

    /**
     * Обновить UI данными пользователя
     */
    updateUI() {
        if (!this.profile) return;
        
        // Здесь можно обновить элементы интерфейса
        // с данными пользователя
    },

    /**
     * Войти с email и паролем
     */
    async signIn(email, password) {
        try {
            const supabase = SupabaseClient.getClient();
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            this.user = data.user;
            this.isAuthenticated = true;
            await this.loadProfile();
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Зарегистрироваться
     */
    async signUp(email, password, userData = {}) {
        try {
            const supabase = SupabaseClient.getClient();
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: userData
                }
            });
            
            if (error) throw error;
            
            return { success: true, user: data.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Выйти из системы
     */
    async signOut() {
        try {
            await SupabaseClient.signOut();
            
            this.user = null;
            this.profile = null;
            this.isAuthenticated = false;
            
            this.redirectToLogin();
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Восстановить пароль
     */
    async resetPassword(email) {
        try {
            const supabase = SupabaseClient.getClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`
            });
            
            if (error) throw error;
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Обновить пароль
     */
    async updatePassword(newPassword) {
        try {
            const supabase = SupabaseClient.getClient();
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            
            if (error) throw error;
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Обновить профиль
     */
    async updateProfile(updates) {
        const { data, error } = await SupabaseClient.updateProfile(updates);
        
        if (error) {
            return { success: false, error };
        }
        
        this.profile = { ...this.profile, ...data };
        this.updateUI();
        
        return { success: true, profile: this.profile };
    },

    /**
     * Подписаться на изменения авторизации
     */
    subscribeToAuthChanges() {
        const supabase = SupabaseClient.getClient();
        
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                this.user = null;
                this.profile = null;
                this.isAuthenticated = false;
                this.redirectToLogin();
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                this.user = session.user;
                this.isAuthenticated = true;
                this.loadProfile();
            }
        });
    },

    /**
     * Перенаправить на страницу входа
     */
    redirectToLogin() {
        if (!window.location.pathname.includes('login')) {
            window.location.href = '/login.html';
        }
    },

    /**
     * Получить текущего пользователя
     */
    getUser() {
        return this.user;
    },

    /**
     * Получить профиль
     */
    getProfile() {
        return this.profile;
    },

    /**
     * Проверить авторизацию
     */
    checkAuth() {
        return this.isAuthenticated;
    }
};

// Экспорт модуля
globalThis.Auth = Auth;
