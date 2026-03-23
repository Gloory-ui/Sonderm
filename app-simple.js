/* Sonderm - Упрощенный клиент с рабочими чатами */
(function() {
  const $ = (id) => document.getElementById(id);
  
  const state = {
    user: null,
    socket: null,
    chats: [],
    activeChatId: null,
    messages: []
  };

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function initials(name) {
    return String(name || "?").trim().slice(0, 2).toUpperCase();
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderChatList() {
    const chatList = $("chatList");
    if (!chatList) return;
    
    if (state.chats.length === 0) {
      chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--tg-muted)">Нет чатов</div>';
      return;
    }
    
    chatList.innerHTML = state.chats.map(chat => `
      <div class="tg-chat-item ${chat.id === state.activeChatId ? 'active' : ''}" data-chat-id="${chat.id}">
        <div class="tg-avatar">${initials(chat.name)}</div>
        <div class="tg-chat-info">
          <div class="tg-chat-name">${escapeHtml(chat.name)}</div>
          <div class="tg-chat-last">${escapeHtml(chat.lastMessage || 'Нет сообщений')}</div>
        </div>
        <div class="tg-chat-meta">
          <div class="tg-chat-time">${formatTime(chat.updatedAt)}</div>
          ${chat.unread ? `<div class="tg-chat-badge">${chat.unread}</div>` : ''}
        </div>
      </div>
    `).join('');
    
    // Обработчики кликов
    chatList.querySelectorAll('.tg-chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        openChat(chatId);
      });
    });
  }

  function renderMessages() {
    const messages = $("messages");
    if (!messages) return;
    
    if (!state.activeChatId) {
      messages.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-muted)">Выберите чат</div>';
      return;
    }
    
    const chatMessages = state.messages.filter(m => m.chatId === state.activeChatId);
    
    if (chatMessages.length === 0) {
      messages.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-muted)">Нет сообщений</div>';
      return;
    }
    
    messages.innerHTML = chatMessages.map(msg => `
      <div class="tg-message ${msg.senderId === state.user?.id ? 'out' : 'in'}">
        <div class="tg-bubble">${escapeHtml(msg.text)}</div>
      </div>
    `).join('');
    
    messages.scrollTop = messages.scrollHeight;
  }

  function openChat(chatId) {
    state.activeChatId = chatId;
    const chat = state.chats.find(c => c.id === chatId);
    
    if (chat) {
      $("headerTitle").textContent = chat.name;
      renderChatList();
      renderMessages();
    }
  }

  async function sendMessage() {
    const input = $("composeInput");
    const text = input.value.trim();
    
    if (!text || !state.activeChatId) return;
    
    const message = {
      id: Date.now().toString(),
      chatId: state.activeChatId,
      senderId: state.user.id,
      text: text,
      createdAt: new Date().toISOString()
    };
    
    state.messages.push(message);
    
    // Обновляем последний чат
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat) {
      chat.lastMessage = text;
      chat.updatedAt = message.createdAt;
    }
    
    input.value = "";
    renderMessages();
    renderChatList();
    
    // Отправка на сервер
    if (state.socket) {
      state.socket.emit('message', message);
    }
  }

  async function createChat(name) {
    const chat = {
      id: Date.now().toString(),
      name: name,
      lastMessage: null,
      updatedAt: new Date().toISOString(),
      unread: 0
    };
    
    state.chats.unshift(chat);
    renderChatList();
    openChat(chat.id);
  }

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
      
      const data = await response.json();
      return data.users || [];
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  async function createChatWithUser(userId) {
    try {
      const token = await window.authClient.getAccessToken();
      const response = await fetch('/api/chats/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ participantId: userId })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      // Добавляем новый чат в список
      const newChat = {
        id: data.chat.id,
        name: 'Новый чат',
        lastMessage: null,
        updatedAt: new Date().toISOString(),
        unread: 0
      };
      
      state.chats.unshift(newChat);
      renderChatList();
      openChat(newChat.id);
      
      return data.chat;
    } catch (error) {
      console.error('Create chat error:', error);
      alert('Не удалось создать чат: ' + error.message);
    }
  }

  function renderContacts() {
    const contactList = $("contactList");
    if (!contactList) return;
    
    contactList.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--tg-muted)">
        <div style="margin-bottom: 16px">
          <input type="text" id="userSearch" placeholder="Поиск пользователей..." 
                 style="width: 100%; padding: 12px; border-radius: 8px; background: var(--tg-panel-2); border: none; color: var(--tg-text);">
        </div>
        <div id="searchResults"></div>
      </div>
    `;
    
    const searchInput = $("userSearch");
    const searchResults = $("searchResults");
    
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      
      if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
      }
      
      searchTimeout = setTimeout(async () => {
        const users = await searchUsers(query);
        
        if (users.length === 0) {
          searchResults.innerHTML = '<div style="color: var(--tg-muted); padding: 10px;">Пользователи не найдены</div>';
          return;
        }
        
        searchResults.innerHTML = users.map(user => `
          <div class="tg-chat-item" style="cursor: pointer;" data-user-id="${user.id}">
            <div class="tg-avatar">${initials(user.display_name || user.username)}</div>
            <div class="tg-chat-info">
              <div class="tg-chat-name">${escapeHtml(user.display_name || user.username)}</div>
              <div class="tg-chat-last">@${escapeHtml(user.username)}</div>
            </div>
          </div>
        `).join('');
        
        searchResults.querySelectorAll('.tg-chat-item').forEach(item => {
          item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            createChatWithUser(userId);
          });
        });
      }, 300);
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tg-screen').forEach(screen => {
      screen.classList.remove('visible');
    });
    document.querySelectorAll('.tg-desktop-nav button').forEach(btn => {
      btn.classList.remove('active');
    });
    
    const targetScreen = $(`screen${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (targetScreen) targetScreen.classList.add('visible');
    
    const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    
    if (tabName === 'contacts') {
      renderContacts();
    }
  }

  async function init() {
    try {
      // Получаем сессию
      const { data, error } = await window.authClient.getSession();
      if (error || !data.session) {
        window.location.href = "/login.html";
        return;
      }
      
      state.user = data.session.user;
      
      // Подключаем Socket.io
      state.socket = await window.authClient.connectAuthenticatedSocket(io);
      
      // Создаем демо чаты
      state.chats = [
        { id: '1', name: 'Али', lastMessage: 'Привет!', updatedAt: new Date().toISOString(), unread: 2 },
        { id: '2', name: 'Боб', lastMessage: 'Как дела?', updatedAt: new Date().toISOString(), unread: 0 },
        { id: '3', name: 'Чарли', lastMessage: 'Встречаемся завтра', updatedAt: new Date().toISOString(), unread: 1 }
      ];
      
      // Демо сообщения
      state.messages = [
        { id: 'm1', chatId: '1', senderId: 'other', text: 'Привет!', createdAt: new Date().toISOString() },
        { id: 'm2', chatId: '1', senderId: 'other', text: 'Как твои дела?', createdAt: new Date().toISOString() },
        { id: 'm3', chatId: '2', senderId: 'other', text: 'Как дела?', createdAt: new Date().toISOString() },
        { id: 'm4', chatId: '3', senderId: 'other', text: 'Встречаемся завтра', createdAt: new Date().toISOString() }
      ];
      
      renderChatList();
      renderMessages();
      
      // Обработчики событий
      $("btnSend").addEventListener('click', sendMessage);
      $("composeInput").addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      
      // Навигация
      document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          switchTab(btn.dataset.tab);
        });
      });
      
      // Поиск в чатах
      $("chatSearch")?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filteredChats = query ? 
          state.chats.filter(chat => chat.name.toLowerCase().includes(query)) : 
          state.chats;
        
        const chatList = $("chatList");
        if (filteredChats.length === 0) {
          chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--tg-muted)">Чаты не найдены</div>';
        } else {
          // Временно заменяем массив для рендеринга
          const originalChats = state.chats;
          state.chats = filteredChats;
          renderChatList();
          state.chats = originalChats;
        }
      });
      
      // Socket обработчики
      state.socket.on('message', (message) => {
        state.messages.push(message);
        if (message.chatId === state.activeChatId) {
          renderMessages();
        } else {
          renderChatList();
        }
      });
      
    } catch (error) {
      console.error('Init error:', error);
      window.location.href = "/login.html";
    }
  }

  // Запуск
  if (window.location.pathname.includes('index.html')) {
    init();
  }
})();
