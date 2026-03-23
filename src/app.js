/* Telegram Ultimate - Main Application */

const App = {
    currentAuthStep: 'login', // 'login' | 'register'
    isAuthVisible: true,
    isAuthProcessing: false, // Защита от race condition

    /**
     * Инициализация приложения
     */
    async init() {
        // Подписываемся на изменения авторизации СНАЧАЛА
        this.setupAuthStateListener();
        
        // Настраиваем UI авторизации
        this.setupAuthUI();
        
        // Проверяем авторизацию
        await this.checkAuth();
    },

    /**
     * Проверить авторизацию при загрузке
     */
    async checkAuth() {
        const { session, error } = await SupabaseClient.getSession();
        
        if (session && session.user) {
            // Пользователь авторизован
            Auth.user = session.user;
            Auth.isAuthenticated = true;
            
            // Загружаем профиль
            await Auth.loadProfile();
            
            // Скрываем экран авторизации
            this.hideAuthOverlay();
            
            // Инициализируем основной UI
            this.initMainApp();
            
            return true;
        } else {
            // Пользователь не авторизован
            this.showAuthOverlay();
            return false;
        }
    },

    /**
     * Подписаться на изменения состояния авторизации
     */
    setupAuthStateListener() {
        const supabase = SupabaseClient.getClient();
        
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Auth state changed:', event, session?.user?.email);
            
            // Игнорируем если уже обрабатываем
            if (this.isAuthProcessing) {
                console.log('⏳ Auth processing, skipping...');
                return;
            }
            
            switch (event) {
                case 'SIGNED_IN':
                case 'INITIAL_SESSION':
                    if (session) {
                        this.isAuthProcessing = true;
                        Auth.user = session.user;
                        Auth.isAuthenticated = true;
                        await Auth.loadProfile();
                        this.hideAuthOverlay();
                        this.initMainApp();
                        this.isAuthProcessing = false;
                    }
                    break;
                    
                case 'SIGNED_OUT':
                    Auth.user = null;
                    Auth.profile = null;
                    Auth.isAuthenticated = false;
                    this.showAuthOverlay();
                    break;
                    
                case 'TOKEN_REFRESHED':
                    Auth.user = session.user;
                    break;
                    
                case 'USER_UPDATED':
                    Auth.user = session.user;
                    await Auth.loadProfile();
                    break;
            }
        });
    },

    /**
     * Настроить UI авторизации
     */
    setupAuthUI() {
        // Кнопка "NEXT" для входа
        const btnNext = UI.$('btnNext');
        if (btnNext) {
            btnNext.addEventListener('click', () => this.handleNextStep());
        }

        // Кнопка "SIGN IN"
        const btnSignIn = UI.$('btnSignIn');
        if (btnSignIn) {
            btnSignIn.addEventListener('click', () => this.handleSignIn());
        }

        // Кнопка "SIGN UP"
        const btnSignUp = UI.$('btnSignUp');
        if (btnSignUp) {
            btnSignUp.addEventListener('click', () => this.handleSignUp());
        }

        // Кнопка переключения sign in/up
        const btnSwitch = UI.$('btnSwitch');
        if (btnSwitch) {
            btnSwitch.addEventListener('click', () => this.toggleAuthMode());
        }

        // Enter в поле пароля
        const authPassword = UI.$('authPassword');
        if (authPassword) {
            authPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSignIn();
                }
            });
        }

        // Enter в полях регистрации
        const authRegPassword = UI.$('authRegPassword');
        if (authRegPassword) {
            authRegPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSignUp();
                }
            });
        }
    },

    /**
     * Переключить режим вход/регистрация
     */
    toggleAuthMode() {
        const stepPhone = UI.$('stepPhone');
        const stepPassword = UI.$('stepPassword');
        const stepRegister = UI.$('stepRegister');
        const authTitle = UI.$('authTitle');
        const authSubtitle = UI.$('authSubtitle');
        const switchText = UI.$('switchText');
        const btnSwitch = UI.$('btnSwitch');
        const authError = UI.$('authError');

        // Очищаем ошибки
        if (authError) {
            authError.textContent = '';
            authError.classList.remove('visible');
        }

        if (this.currentAuthStep === 'login') {
            // Переключаемся на регистрацию
            this.currentAuthStep = 'register';
            
            UI.addClass(stepPhone, 'hidden');
            UI.addClass(stepPassword, 'hidden');
            UI.removeClass(stepRegister, 'hidden');
            
            authTitle.textContent = 'Sign up for Telegram';
            authSubtitle.textContent = 'Create your account';
            switchText.textContent = 'Already have an account?';
            btnSwitch.textContent = 'Sign in';
        } else {
            // Переключаемся на вход
            this.currentAuthStep = 'login';
            
            UI.removeClass(stepPhone, 'hidden');
            UI.addClass(stepPassword, 'hidden');
            UI.addClass(stepRegister, 'hidden');
            
            authTitle.textContent = 'Sign in to Telegram';
            authSubtitle.textContent = 'Please enter your credentials to continue';
            switchText.textContent = "Don't have an account?";
            btnSwitch.textContent = 'Sign up';
        }
    },

    /**
     * Обработка кнопки NEXT (проверка email/телефона)
     */
    async handleNextStep() {
        const identifier = UI.$('authIdentifier').value.trim();
        const errorEl = UI.$('identifierError');
        
        // Валидация
        if (!identifier) {
            errorEl.textContent = 'Please enter email or phone';
            return;
        }
        
        if (!identifier.includes('@') && identifier.length < 5) {
            errorEl.textContent = 'Please enter valid email';
            return;
        }
        
        errorEl.textContent = '';
        
        // Показываем поле пароля
        UI.addClass(UI.$('stepPhone'), 'hidden');
        UI.removeClass(UI.$('stepPassword'), 'hidden');
        
        // Фокус на пароль
        setTimeout(() => {
            UI.$('authPassword').focus();
        }, 100);
    },

    /**
     * Обработка входа
     */
    async handleSignIn() {
        const identifier = UI.$('authIdentifier').value.trim();
        const password = UI.$('authPassword').value;
        const errorEl = UI.$('passwordError');
        
        // Валидация
        if (!identifier || !password) {
            errorEl.textContent = 'Please fill in all fields';
            return;
        }
        
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }
        
        // Показываем загрузку
        this.setLoading(true);
        
        // Входим
        const result = await Auth.signIn(identifier, password);
        
        // Скрываем загрузку
        this.setLoading(false);
        
        if (result.success) {
            // Успешно - обновляем UI напрямую (на случай если listener не сработал)
            errorEl.textContent = '';
            Auth.user = result.user || await SupabaseClient.getCurrentUser();
            Auth.isAuthenticated = true;
            await Auth.loadProfile();
            this.hideAuthOverlay();
            this.initMainApp();
            UI.showNotification('Welcome back!');
        } else {
            // Ошибка
            errorEl.textContent = result.error || 'Invalid credentials';
            this.showAuthError(result.error || 'Invalid credentials');
        }
    },

    /**
     * Обработка регистрации
     */
    async handleSignUp() {
        const fullName = UI.$('authFullName').value.trim();
        const email = UI.$('authEmail').value.trim();
        const password = UI.$('authRegPassword').value;
        
        // Сброс ошибок
        UI.$('fullNameError').textContent = '';
        UI.$('emailError').textContent = '';
        UI.$('regPasswordError').textContent = '';
        
        // Валидация
        let hasError = false;
        
        if (!fullName || fullName.length < 2) {
            UI.$('fullNameError').textContent = 'Please enter your full name';
            hasError = true;
        }
        
        if (!email || !email.includes('@')) {
            UI.$('emailError').textContent = 'Please enter valid email';
            hasError = true;
        }
        
        if (!password || password.length < 6) {
            UI.$('regPasswordError').textContent = 'Password must be at least 6 characters';
            hasError = true;
        }
        
        if (hasError) return;
        
        // Показываем загрузку
        this.setLoading(true);
        
        // Регистрируем
        const result = await Auth.signUp(email, password, fullName);
        
        // Скрываем загрузку
        this.setLoading(false);
        
        if (result.success) {
            // Успешно - обновляем UI напрямую
            UI.$('fullNameError').textContent = '';
            UI.$('emailError').textContent = '';
            UI.$('regPasswordError').textContent = '';
            
            // Сразу входим после регистрации
            Auth.user = result.user;
            Auth.isAuthenticated = true;
            await Auth.loadProfile();
            this.hideAuthOverlay();
            this.initMainApp();
            UI.showNotification('Account created successfully!');
        } else {
            // Ошибка
            this.showAuthError(result.error || 'Registration failed');
        }
    },

    /**
     * Показать/скрыть загрузку
     */
    setLoading(loading) {
        const authLoading = UI.$('authLoading');
        if (authLoading) {
            if (loading) {
                UI.removeClass(authLoading, 'hidden');
            } else {
                UI.addClass(authLoading, 'hidden');
            }
        }
        
        // Блокируем кнопки
        const buttons = document.querySelectorAll('.auth-btn');
        buttons.forEach(btn => {
            btn.disabled = loading;
        });
    },

    /**
     * Показать ошибку авторизации
     */
    showAuthError(message) {
        const authError = UI.$('authError');
        if (authError) {
            authError.textContent = message;
            authError.classList.add('visible');
            
            // Скрываем через 5 секунд
            setTimeout(() => {
                authError.classList.remove('visible');
            }, 5000);
        }
    },

    /**
     * Показать экран авторизации
     */
    showAuthOverlay() {
        const authOverlay = UI.$('authOverlay');
        if (authOverlay) {
            UI.removeClass(authOverlay, 'hidden');
        }
        this.isAuthVisible = true;
    },

    /**
     * Скрыть экран авторизации
     */
    hideAuthOverlay() {
        const authOverlay = UI.$('authOverlay');
        if (authOverlay) {
            UI.addClass(authOverlay, 'hidden');
        }
        this.isAuthVisible = false;
    },

    /**
     * Инициализировать основное приложение
     */
    initMainApp() {
        // Настраиваем основной UI
        this.setupMainUI();
        
        // Инициализируем чаты
        Chat.init();
        
        // Показываем приветствие
        UI.showNotification('Welcome to Telegram Ultimate!');
    },

    /**
     * Настроить основной UI
     */
    setupMainUI() {
        // Кнопка меню
        const menuBtn = UI.$('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                // TODO: Открыть боковое меню
            });
        }

        // Кнопка назад (мобильная)
        const backBtn = UI.$('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                Chat.backToChatList();
            });
        }

        // Отправка сообщения
        const sendBtn = UI.$('sendBtn');
        const messageInput = UI.$('messageInput');

        if (sendBtn && messageInput) {
            sendBtn.addEventListener('click', () => {
                Chat.sendMessage(messageInput.value);
            });

            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    Chat.sendMessage(messageInput.value);
                }
            });

            // Авто-ресайз
            messageInput.addEventListener('input', () => {
                UI.autoResizeTextarea(messageInput);
            });
        }

        // Поиск
        const searchInput = UI.$('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', UI.debounce(async (e) => {
                const query = e.target.value.trim();
                if (query.length >= 2) {
                    // TODO: Реализовать поиск чатов
                }
            }, 300));
        }

        // Обработка изменения размера окна
        window.addEventListener('resize', () => {
            if (!UI.isMobile() && Chat.currentChatId) {
                UI.removeClass('app', 'is-chat-open');
            }
        });
    }
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Экспорт
globalThis.App = App;
