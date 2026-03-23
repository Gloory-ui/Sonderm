/* Telegram Ultimate - Main Application */

const App = {
    /**
     * Инициализация приложения
     */
    async init() {
        // Проверяем авторизацию
        const isAuth = await Auth.init();
        if (!isAuth) return;

        // Инициализируем UI
        this.setupUI();

        // Инициализируем чаты
        await Chat.init();

        // Показываем уведомление
        UI.showNotification('Добро пожаловать в Telegram Ultimate!');
    },

    /**
     * Настройка UI элементов
     */
    setupUI() {
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
