/* Sonderm - Правильная реализация */
(function() {
    const $ = (id) => document.getElementById(id);
    
    const state = {
        user: null,
        profile: null,
        socket: null,
        chats: [],
        activeChatId: null,
        messages: [],
        currentTab: 'chats'
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function initials(name) {
        if (!name) return '?';
        return name.trim().split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    }

    function formatTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        
        if (d.toDateString() === now.toDateString()) {
            return formatTime(date);
        }
        
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    }

    // Рендеринг списка чатов
    function renderChatList() {
        const chatList = $('chatList');
        if (!chatList) return;

        if (state.chats.length === 0) {
            chatList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-text">Нет чатов</div>
                    <div class="empty-subtext">Начните общение с контактов</div>
                </div>
            `;
            return;
        }

        chatList.innerHTML = state.chats.map(chat => `
            <div class="chat-item ${chat.id === state.activeChatId ? 'active' : ''}" data-chat-id="${chat.id}">
                <div class="avatar">${initials(chat.name)}</div>
                <div class="chat-info">
                    <div class="chat-name">${escapeHtml(chat.name)}</div>
                    <div class="chat-last">${escapeHtml(chat.last_message || 'Нет сообщений')}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${formatDate(chat.updated_at)}</div>
                    ${chat.unread_count > 0 ? `<div class="chat-badge">${chat.unread_count}</div>` : ''}
                </div>
            </div>
        `).join('');

        // Обработчики кликов
        chatList.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const chatId = item.dataset.chatId;
                openChat(chatId);
            });
        });
    }

    // Рендеринг сообщений
    function renderMessages() {
        const messages = $('messages');
        if (!messages) return;

        if (!state.activeChatId) {
            messages.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-text">Выберите чат</div>
                    <div class="empty-subtext">Начните общение</div>
                </div>
            `;
            return;
        }

        const chatMessages = state.messages.filter(m => m.chat_id === state.activeChatId);
        
        if (chatMessages.length === 0) {
            messages.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-text">Нет сообщений</div>
                    <div class="empty-subtext">Начните общение</div>
                </div>
            `;
            return;
        }

        messages.innerHTML = chatMessages.map(msg => {
            const isOwn = msg.sender_id === state.user?.id;
            return `
                <div class="message ${isOwn ? 'out' : 'in'}">
                    <div class="bubble">
                        ${escapeHtml(msg.content)}
                        <div class="message-time">${formatTime(msg.created_at)}</div>
                    </div>
                </div>
            `;
        }).join('');

        messages.scrollTop = messages.scrollHeight;
    }

    // Открытие чата
    function openChat(chatId) {
        state.activeChatId = chatId;
        const chat = state.chats.find(c => c.id === chatId);
        
        if (chat) {
            $('chatName').textContent = chat.name;
            $('chatAvatar').textContent = initials(chat.name);
            
            // Показываем панель чата на мобильных
            if (window.innerWidth <= 767) {
                $('chatsPanel').classList.add('mobile-hidden');
                $('chatPanel').classList.add('mobile-visible');
            }
            
            renderChatList();
            renderMessages();
            
            // Загружаем сообщения
            loadMessages(chatId);
        }
    }

    // Загрузка сообщений
    async function loadMessages(chatId) {
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch(`/api/messages/${chatId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                state.messages = data.messages || [];
                renderMessages();
            }
        } catch (error) {
            console.error('Load messages error:', error);
        }
    }

    // Отправка сообщения
    async function sendMessage() {
        const input = $('messageInput');
        const text = input.value.trim();
        
        if (!text || !state.activeChatId) return;
        
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch('/api/messages/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    chat_id: state.activeChatId,
                    content: text
                })
            });
            
            if (response.ok) {
                input.value = '';
                // Сообщение придет через сокет
            }
        } catch (error) {
            console.error('Send message error:', error);
        }
    }

    // Поиск пользователей
    async function searchUsers(query) {
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch('/api/search/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ query })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.users || [];
            }
        } catch (error) {
            console.error('Search users error:', error);
        }
        return [];
    }

    // Создание чата
    async function createChat(userId) {
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch('/api/chats/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ participant_id: userId })
            });
            
            if (response.ok) {
                const data = await response.json();
                await loadChats();
                switchTab('chats');
                openChat(data.chat.id);
            }
        } catch (error) {
            console.error('Create chat error:', error);
        }
    }

    // Рендеринг контактов
    function renderContacts(users) {
        const contactList = $('contactList');
        if (!contactList) return;

        if (users.length === 0) {
            contactList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <div class="empty-text">Пользователи не найдены</div>
                    <div class="empty-subtext">Попробуйте другой поисковый запрос</div>
                </div>
            `;
            return;
        }

        contactList.innerHTML = users.map(user => `
            <div class="list-item" data-user-id="${user.id}">
                <div class="avatar sm">${initials(user.display_name || user.username)}</div>
                <div class="chat-info">
                    <div class="chat-name">${escapeHtml(user.display_name || user.username)}</div>
                    <div class="chat-last">@${escapeHtml(user.username)}</div>
                </div>
            </div>
        `).join('');

        // Обработчики кликов
        contactList.querySelectorAll('.list-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                if (userId !== state.user?.id) {
                    createChat(userId);
                }
            });
        });
    }

    // Переключение вкладок
    function switchTab(tabName) {
        state.currentTab = tabName;
        
        // Обновляем навигацию
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Обновляем экраны
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        $(`${tabName}Screen`).classList.add('active');
        
        // Обновляем заголовок
        const titles = {
            chats: 'Чаты',
            contacts: 'Контакты',
            settings: 'Настройки',
            profile: 'Профиль'
        };
        $('headerTitle').textContent = titles[tabName];
    }

    // Загрузка чатов
    async function loadChats() {
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch('/api/chats', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                state.chats = data.chats || [];
                renderChatList();
            }
        } catch (error) {
            console.error('Load chats error:', error);
            // Демо данные если API недоступен
            state.chats = [
                {
                    id: '1',
                    name: 'Али',
                    last_message: 'Привет!',
                    updated_at: new Date().toISOString(),
                    unread_count: 2
                },
                {
                    id: '2',
                    name: 'Боб',
                    last_message: 'Как дела?',
                    updated_at: new Date().toISOString(),
                    unread_count: 0
                }
            ];
            renderChatList();
        }
    }

    // Загрузка профиля
    async function loadProfile() {
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch('/api/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                state.profile = data.profile;
                
                // Обновляем поля профиля
                if (state.profile) {
                    $('displayName').value = state.profile.display_name || '';
                    $('username').value = state.profile.username || '';
                    $('headerSubtitle').textContent = state.profile.email || '';
                }
            }
        } catch (error) {
            console.error('Load profile error:', error);
        }
    }

    // Сохранение профиля
    async function saveProfile() {
        try {
            const token = await window.authClient.getAccessToken();
            const response = await fetch('/api/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    display_name: $('displayName').value.trim(),
                    username: $('username').value.trim()
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                state.profile = data.profile;
                alert('Профиль сохранен!');
            }
        } catch (error) {
            console.error('Save profile error:', error);
            alert('Ошибка сохранения профиля');
        }
    }

    // Настройка UI
    function setupUI() {
        // Навигация
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.tab);
            });
        });

        // Кнопка назад
        $('backBtn').addEventListener('click', () => {
            $('chatsPanel').classList.remove('mobile-hidden');
            $('chatPanel').classList.remove('mobile-visible');
            state.activeChatId = null;
            renderChatList();
            renderMessages();
        });

        // Отправка сообщения
        $('sendBtn').addEventListener('click', sendMessage);
        $('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Поиск чатов
        $('chatSearch').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = state.chats.filter(chat => 
                chat.name.toLowerCase().includes(query)
            );
            
            const chatList = $('chatList');
            if (filtered.length === 0) {
                chatList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <div class="empty-text">Чаты не найдены</div>
                    </div>
                `;
            } else {
                // Временная замена для рендеринга
                const original = state.chats;
                state.chats = filtered;
                renderChatList();
                state.chats = original;
            }
        });

        // Поиск контактов
        let searchTimeout;
        $('contactSearch').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                renderContacts([]);
                return;
            }
            
            searchTimeout = setTimeout(async () => {
                const users = await searchUsers(query);
                renderContacts(users);
            }, 300);
        });

        // Профиль
        $('saveProfileBtn').addEventListener('click', saveProfile);

        // Выход
        $('logoutBtn').addEventListener('click', async () => {
            await window.authClient.signOut();
            window.location.href = '/login.html';
        });

        // Файлы
        $('attachBtn').addEventListener('click', () => {
            $('fileInput').click();
        });

        $('fileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                console.log('File selected:', file);
                // Загрузка файла
            }
        });
    }

    // Инициализация приложения
    async function init() {
        try {
            // Проверяем авторизацию
            const { data: { session }, error } = await window.authClient.getSession();
            if (error || !session) {
                window.location.href = '/login.html';
                return;
            }
            
            state.user = session.user;
            
            // Подключаем сокет
            try {
                state.socket = await window.authClient.connectAuthenticatedSocket(io);
            } catch (e) {
                console.error('Socket connection error:', e);
            }
            
            // Загружаем данные
            await Promise.all([
                loadProfile(),
                loadChats()
            ]);
            
            // Настраиваем UI
            setupUI();
            
            // Обработчики сокетов
            if (state.socket) {
                state.socket.on('message:new', (message) => {
                    state.messages.push(message);
                    if (message.chat_id === state.activeChatId) {
                        renderMessages();
                    } else {
                        // Обновляем счетчик
                        const chat = state.chats.find(c => c.id === message.chat_id);
                        if (chat) {
                            chat.unread_count = (chat.unread_count || 0) + 1;
                            chat.last_message = message.content;
                            chat.updated_at = message.created_at;
                            renderChatList();
                        }
                    }
                });
                
                state.socket.on('chat:new', (chat) => {
                    state.chats.unshift(chat);
                    renderChatList();
                });
            }
            
        } catch (error) {
            console.error('Init error:', error);
            window.location.href = '/login.html';
        }
    }

    // Запуск
    document.addEventListener('DOMContentLoaded', init);
})();
