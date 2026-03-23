/* Telegram Ultimate - Main Application (100% Telegram Clone) */

const App = {
    currentAuthStep: 'login',
    isAuthVisible: true,
    isAuthProcessing: false,

    /**
     * Initialize the application
     */
    async init() {
        // Setup auth state listener FIRST
        this.setupAuthStateListener();
        
        // Setup auth UI
        this.setupAuthUI();
        
        // Check authentication
        await this.checkAuth();
    },

    /**
     * Check authentication status on load
     */
    async checkAuth() {
        const { session, error } = await SupabaseClient.getSession();
        
        if (session && session.user) {
            // User is authenticated
            Auth.user = session.user;
            Auth.isAuthenticated = true;
            
            // Load profile
            await Auth.loadProfile();
            
            // Hide auth overlay
            this.hideAuthOverlay();
            
            // Initialize main app
            this.initMainApp();
            
            return true;
        } else {
            // User is not authenticated
            this.showAuthOverlay();
            return false;
        }
    },

    /**
     * Setup auth state change listener
     */
    setupAuthStateListener() {
        const supabase = SupabaseClient.getClient();
        
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event);
            
            // Skip if already processing
            if (this.isAuthProcessing) {
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
     * Setup auth UI
     */
    setupAuthUI() {
        // Next button
        const btnNext = UI.$('btnNext');
        if (btnNext) {
            btnNext.addEventListener('click', () => this.handleNextStep());
        }

        // Sign in button
        const btnSignIn = UI.$('btnSignIn');
        if (btnSignIn) {
            btnSignIn.addEventListener('click', () => this.handleSignIn());
        }

        // Sign up button
        const btnSignUp = UI.$('btnSignUp');
        if (btnSignUp) {
            btnSignUp.addEventListener('click', () => this.handleSignUp());
        }

        // Switch mode button
        const btnSwitch = UI.$('btnSwitch');
        if (btnSwitch) {
            btnSwitch.addEventListener('click', () => this.toggleAuthMode());
        }

        // Enter key in password field
        const authPassword = UI.$('authPassword');
        if (authPassword) {
            authPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSignIn();
                }
            });
        }

        // Enter key in registration password
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
     * Toggle auth mode (login/register)
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

        // Clear errors
        if (authError) {
            authError.textContent = '';
            authError.classList.remove('visible');
        }

        if (this.currentAuthStep === 'login') {
            // Switch to register
            this.currentAuthStep = 'register';
            
            UI.addClass(stepPhone, 'hidden');
            UI.addClass(stepPassword, 'hidden');
            UI.removeClass(stepRegister, 'hidden');
            
            authTitle.textContent = 'Sign up for Telegram';
            authSubtitle.textContent = 'Create your account';
            switchText.textContent = 'Already have an account?';
            btnSwitch.textContent = 'Sign in';
        } else {
            // Switch to login
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
     * Handle next step (email validation)
     */
    async handleNextStep() {
        const identifier = UI.$('authIdentifier').value.trim();
        const errorEl = UI.$('identifierError');
        
        // Validation
        if (!identifier) {
            errorEl.textContent = 'Please enter email or phone';
            return;
        }
        
        if (!identifier.includes('@')) {
            errorEl.textContent = 'Please enter valid email';
            return;
        }
        
        errorEl.textContent = '';
        
        // Show password step
        UI.addClass(UI.$('stepPhone'), 'hidden');
        UI.removeClass(UI.$('stepPassword'), 'hidden');
        
        // Focus password
        setTimeout(() => {
            UI.$('authPassword').focus();
        }, 100);
    },

    /**
     * Handle sign in
     */
    async handleSignIn() {
        const identifier = UI.$('authIdentifier').value.trim();
        const password = UI.$('authPassword').value;
        const errorEl = UI.$('passwordError');
        
        // Validation
        if (!identifier || !password) {
            errorEl.textContent = 'Please fill in all fields';
            return;
        }
        
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }
        
        // Show loading
        this.setLoading(true);
        
        // Sign in
        const result = await Auth.signIn(identifier, password);
        
        // Hide loading
        this.setLoading(false);
        
        if (result.success) {
            // Success - update UI directly
            errorEl.textContent = '';
            Auth.user = result.user || await SupabaseClient.getCurrentUser();
            Auth.isAuthenticated = true;
            await Auth.loadProfile();
            this.hideAuthOverlay();
            this.initMainApp();
            UI.showNotification('Welcome back!');
        } else {
            // Error
            errorEl.textContent = result.error || 'Invalid credentials';
            this.showAuthError(result.error || 'Invalid credentials');
        }
    },

    /**
     * Handle sign up
     */
    async handleSignUp() {
        const fullName = UI.$('authFullName').value.trim();
        const email = UI.$('authEmail').value.trim();
        const password = UI.$('authRegPassword').value;
        
        // Reset errors
        UI.$('fullNameError').textContent = '';
        UI.$('emailError').textContent = '';
        UI.$('regPasswordError').textContent = '';
        
        // Validation
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
        
        // Show loading
        this.setLoading(true);
        
        // Sign up
        const result = await Auth.signUp(email, password, fullName);
        
        // Hide loading
        this.setLoading(false);
        
        if (result.success) {
            // Success - auto login after registration
            Auth.user = result.user;
            Auth.isAuthenticated = true;
            await Auth.loadProfile();
            this.hideAuthOverlay();
            this.initMainApp();
            UI.showNotification('Account created successfully!');
        } else {
            // Error
            this.showAuthError(result.error || 'Registration failed');
        }
    },

    /**
     * Show/hide loading
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
        
        // Disable buttons
        const buttons = document.querySelectorAll('.auth-btn');
        buttons.forEach(btn => {
            btn.disabled = loading;
        });
    },

    /**
     * Show auth error
     */
    showAuthError(message) {
        const authError = UI.$('authError');
        if (authError) {
            authError.textContent = message;
            authError.classList.add('visible');
            
            // Hide after 5 seconds
            setTimeout(() => {
                authError.classList.remove('visible');
            }, 5000);
        }
    },

    /**
     * Show auth overlay
     */
    showAuthOverlay() {
        const authOverlay = UI.$('authOverlay');
        if (authOverlay) {
            UI.removeClass(authOverlay, 'hidden');
        }
        this.isAuthVisible = true;
    },

    /**
     * Hide auth overlay
     */
    hideAuthOverlay() {
        const authOverlay = UI.$('authOverlay');
        if (authOverlay) {
            UI.addClass(authOverlay, 'hidden');
        }
        this.isAuthVisible = false;
    },

    /**
     * Initialize main app
     */
    initMainApp() {
        // Setup main UI
        this.setupMainUI();
        
        // Initialize chat module
        Chat.init();
        
        // Show welcome notification
        UI.showNotification('Welcome to Telegram!');
    },

    /**
     * Setup main UI
     */
    setupMainUI() {
        // Menu button
        const menuBtn = UI.$('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                // TODO: Open side menu
                console.log('Menu clicked');
            });
        }

        // Back button (mobile)
        const backBtn = UI.$('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                UI.hideChatArea();
                Chat.currentChatId = null;
            });
        }

        // Send message
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

            // Auto-resize
            messageInput.addEventListener('input', () => {
                UI.autoResizeTextarea(messageInput);
            });
        }

        // Search
        const searchInput = UI.$('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', UI.debounce(async (e) => {
                const query = e.target.value.trim();
                if (query.length >= 2) {
                    // TODO: Implement chat search
                    console.log('Search:', query);
                }
            }, 300));
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            if (!UI.isMobile() && Chat.currentChatId) {
                UI.removeClass('app', 'is-chat-open');
            }
        });
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export
globalThis.App = App;
