/* Telegram Ultimate - Chat Module */

const Chat = {
    chats: [],
    currentChatId: null,
    messages: [],
    subscriptions: [],

    /**
     * Инициализация модуля чатов
     */
    async init() {
        await this.loadChats();
        this.setupSubscriptions();
        this.renderChatList();
    },

    /**
     * Загрузить список чатов
     */
    async loadChats() {
        this.chats = await SupabaseClient.getUserChats();
        this.renderChatList();
    },

    /**
     * Настроить подписки на изменения
     */
    setupSubscriptions() {
        // Подписка на новые сообщения
        const messagesSubscription = SupabaseClient.subscribeToChanges('messages', (payload) => {
            if (payload.eventType === 'INSERT') {
                this.handleNewMessage(payload.new);
            }
        });

        this.subscriptions.push(messagesSubscription);
    },

    /**
     * Обработать новое сообщение
     */
    handleNewMessage(message) {
        // Если сообщение в текущем чате
        if (message.chat_id === this.currentChatId) {
            this.messages.push(message);
            this.renderMessage(message);
            this.scrollToBottom();
        }
        
        // Обновить список чатов
        this.updateChatPreview(message.chat_id, message);
    },

    /**
     * Открыть чат
     */
    async openChat(chatId) {
        this.currentChatId = chatId;
        const chat = this.chats.find(c => c.id === chatId);
        
        if (!chat) return;

        // Обновляем UI
        this.updateChatHeader(chat);
        
        // Загружаем сообщения
        await this.loadMessages(chatId);
        
        // Отмечаем как прочитанное
        await SupabaseClient.markMessagesAsRead(chatId);
        
        // На мобильных - показываем чат
        if (UI.isMobile()) {
            UI.addClass('app', 'is-chat-open');
        }
    },

    /**
     * Загрузить сообщения чата
     */
    async loadMessages(chatId) {
        this.messages = await SupabaseClient.getChatMessages(chatId);
        this.renderMessages();
    },

    /**
     * Отправить сообщение
     */
    async sendMessage(text) {
        if (!this.currentChatId || !text.trim()) return;

        const { data, error } = await SupabaseClient.sendMessage(
            this.currentChatId, 
            text
        );

        if (error) {
            UI.showNotification('Ошибка отправки сообщения', 'error');
            return;
        }

        // Очищаем поле ввода
        const input = UI.$('messageInput');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }

        // Обновляем список чатов
        this.updateChatPreview(this.currentChatId, data);
    },

    /**
     * Создать новый чат
     */
    async createNewChat(participantId, type = 'private') {
        const { data, error } = await SupabaseClient.createChat(
            [participantId], 
            type
        );

        if (error) {
            UI.showNotification('Ошибка создания чата', 'error');
            return null;
        }

        // Перезагружаем список чатов
        await this.loadChats();
        
        // Открываем новый чат
        if (data) {
            this.openChat(data.id);
        }

        return data;
    },

    /**
     * Обновить превью чата
     */
    updateChatPreview(chatId, message) {
        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
            chat.lastMessage = message;
            chat.updated_at = message.created_at;
            this.renderChatList();
        }
    },

    /**
     * Обновить заголовок чата
     */
    updateChatHeader(chat) {
        const titleEl = UI.$('chatTitle');
        const avatarEl = UI.$('chatAvatar');
        const statusEl = UI.$('chatStatus');

        if (titleEl) {
            titleEl.textContent = chat.title || this.getChatName(chat);
        }

        if (avatarEl) {
            avatarEl.textContent = UI.getInitials(chat.title || this.getChatName(chat));
        }

        if (statusEl) {
            // Проверяем онлайн статус
            const isOnline = this.isChatOnline(chat);
            statusEl.textContent = isOnline ? 'онлайн' : 'был(а) недавно';
            UI.toggleClass(statusEl, 'online', isOnline);
        }
    },

    /**
     * Получить имя чата
     */
    getChatName(chat) {
        if (chat.title) return chat.title;
        
        // Для приватных чатов - имя собеседника
        if (chat.type === 'private' && chat.participants) {
            const otherParticipant = chat.participants.find(
                p => p.profiles.id !== Auth.getUser()?.id
            );
            if (otherParticipant) {
                return otherParticipant.profiles.full_name || 
                       otherParticipant.profiles.username;
            }
        }
        
        return 'Неизвестный чат';
    },

    /**
     * Проверить онлайн статус чата
     */
    isChatOnline(chat) {
        if (chat.type === 'private' && chat.participants) {
            const otherParticipant = chat.participants.find(
                p => p.profiles.id !== Auth.getUser()?.id
            );
            return otherParticipant?.profiles?.is_online || false;
        }
        return false;
    },

    /**
     * Отрендерить список чатов
     */
    renderChatList() {
        const container = UI.$('chatList');
        if (!container) return;

        if (this.chats.length === 0) {
            container.innerHTML = `
                <div class="empty-chats">
                    <div class="empty-icon">💬</div>
                    <p>Нет сообщений</p>
                </div>
            `;
            return;
        }

        // Сортируем чаты по времени последнего сообщения
        const sortedChats = [...this.chats].sort((a, b) => {
            const timeA = new Date(a.updated_at || a.created_at);
            const timeB = new Date(b.updated_at || b.created_at);
            return timeB - timeA;
        });

        container.innerHTML = sortedChats.map(chat => this.createChatItem(chat)).join('');

        // Добавляем обработчики кликов
        container.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                this.openChat(item.dataset.chatId);
            });
        });
    },

    /**
     * Создать элемент чата
     */
    createChatItem(chat) {
        const isActive = chat.id === this.currentChatId;
        const lastMessage = chat.lastMessage;
        const chatName = this.getChatName(chat);

        return `
            <div class="chat-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                <div class="avatar">${UI.getInitials(chatName)}</div>
                <div class="chat-info">
                    <div class="chat-name">${UI.escapeHtml(chatName)}</div>
                    <div class="chat-last">
                        ${lastMessage ? UI.escapeHtml(lastMessage.text) : 'Нет сообщений'}
                    </div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">
                        ${lastMessage ? UI.formatDate(lastMessage.created_at) : ''}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Отрендерить сообщения
     */
    renderMessages() {
        const container = UI.$('messagesContainer');
        if (!container) return;

        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="welcome-screen">
                    <div class="welcome-content">
                        <p>Нет сообщений</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.messages.map(msg => this.createMessageHTML(msg)).join('');
        this.scrollToBottom();
    },

    /**
     * Отрендерить одно сообщение
     */
    renderMessage(message) {
        const container = UI.$('messagesContainer');
        if (!container) return;

        const messageHTML = this.createMessageHTML(message);
        container.insertAdjacentHTML('beforeend', messageHTML);
    },

    /**
     * Создать HTML сообщения
     */
    createMessageHTML(message) {
        const isOwn = message.sender_id === Auth.getUser()?.id;
        const sender = message.profiles || {};

        return `
            <div class="message ${isOwn ? 'outgoing' : 'incoming'} fade-in">
                <div class="message-bubble">
                    ${!isOwn ? `<div class="message-sender">${UI.escapeHtml(sender.full_name || sender.username)}</div>` : ''}
                    <div class="message-text">${UI.escapeHtml(message.text)}</div>
                    <div class="message-time">${UI.formatTime(message.created_at)}</div>
                </div>
            </div>
        `;
    },

    /**
     * Прокрутить к последнему сообщению
     */
    scrollToBottom() {
        const container = UI.$('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    /**
     * Вернуться к списку чатов (мобильная версия)
     */
    backToChatList() {
        this.currentChatId = null;
        UI.removeClass('app', 'is-chat-open');
    },

    /**
     * Отписаться от всех подписок
     */
    cleanup() {
        this.subscriptions.forEach(sub => {
            if (sub && sub.unsubscribe) {
                sub.unsubscribe();
            }
        });
        this.subscriptions = [];
    }
};

// Экспорт модуля
globalThis.Chat = Chat;
