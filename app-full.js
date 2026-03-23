/* Sonderm - Полноценный клиент с полным функционалом */
(function () {
  const $ = (id) => document.getElementById(id);

  const EMOJI_PANEL = ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "🤔", "👍", "👎", "❤️", "🔥", "✨", "🎉", "😢", "🙏", "🤝", "💬", "⚡", "🌙"];
  const STICKERS = ["🐱", "🐶", "🦊", "🐸", "🐵", "🐻", "🐼", "🦁", "🎮", "🚀", "⭐", "💎", "🍕", "🍔", "☕", "🎵", "🎬", "⚽", "🏀", "🎁"];
  const REACTIONS = ["❤️", "👍", "👎", "👏"];

  const state = {
    user: null,
    profile: null,
    socket: null,
    chats: [],
    activeChatId: null,
    messages: [],
    participantsByChat: {},
    folders: [],
    folderChatMap: {},
    activeFolderId: null,
    replyTo: null,
    forwardIds: [],
    ctxMessageId: null,
    reactionMessageId: null,
    typingTimer: null,
    recording: false,
    readsCache: {},
    pinnedChatIds: [],
    deliveryByMessage: {},
    readByMessage: {},
    forwardProfileCache: {},
    selectedFolderIcon: "📁",
    editingFolderId: null,
    addMemberPick: new Set(),
    dragChatId: null,
  };

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatRichText(raw) {
    let s = escapeHtml(raw);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    s = s.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
    return s;
  }

  function initials(name) {
    const t = String(name || "?").trim();
    return t.slice(0, 2).toUpperCase();
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatListTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return formatTime(iso);
    return d.toLocaleDateString([], { day: "2-digit", month: "short" });
  }

  function renderChatList() {
    const chatList = $("chatList");
    if (!chatList) return;
    
    const filteredChats = state.activeFolderId ? 
      (state.folderChatMap[state.activeFolderId] || []) : 
      state.chats;
    
    if (filteredChats.length === 0) {
      chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--tg-muted)">Нет чатов</div>';
      return;
    }
    
    chatList.innerHTML = filteredChats.map(chat => {
      const unread = chat.unread_count || 0;
      const lastMsg = chat.last_message || {};
      const isPinned = state.pinnedChatIds.includes(chat.id);
      
      return `
        <div class="tg-chat-item ${chat.id === state.activeChatId ? 'active' : ''}" 
             data-chat-id="${chat.id}" 
             style="order: ${isPinned ? -1 : 0}">
          <div class="tg-avatar">${initials(chat.name)}</div>
          <div class="tg-chat-info">
            <div class="tg-chat-name">${escapeHtml(chat.name)}</div>
            <div class="tg-chat-last">${escapeHtml(lastMsg.content || 'Нет сообщений')}</div>
          </div>
          <div class="tg-chat-meta">
            <div class="tg-chat-time">${formatListTime(chat.updated_at)}</div>
            ${unread ? `<div class="tg-chat-badge">${unread}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    
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
    
    const chatMessages = state.messages.filter(m => m.chat_id === state.activeChatId);
    
    if (chatMessages.length === 0) {
      messages.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tg-muted)">Нет сообщений</div>';
      return;
    }
    
    messages.innerHTML = chatMessages.map(msg => {
      const isOwn = msg.sender_id === state.user?.id;
      const reactions = msg.reactions ? Object.entries(msg.reactions) : [];
      
      return `
        <div class="tg-message ${isOwn ? 'out' : 'in'}" data-message-id="${msg.id}">
          <div class="tg-bubble">
            ${formatRichText(msg.content)}
            ${msg.file_url ? `
              <div style="margin-top: 8px;">
                ${msg.file_type.startsWith('image/') ? 
                  `<img src="${msg.file_url}" style="max-width: 200px; max-height: 200px; border-radius: 8px;">` :
                  `<div style="padding: 8px; background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 4px;">
                    📎 ${escapeHtml(msg.content)}
                  </div>`
                }
              </div>
            ` : ''}
            <div class="tg-message-time">${formatTime(msg.created_at)}</div>
            ${reactions.length > 0 ? `
              <div style="margin-top: 4px; display: flex; gap: 4px;">
                ${reactions.map(([emoji, users]) => `
                  <span style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 12px; font-size: 12px;">
                    ${emoji} ${users.length}
                  </span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    messages.scrollTop = messages.scrollHeight;
  }

  function openChat(chatId) {
    state.activeChatId = chatId;
    const chat = state.chats.find(c => c.id === chatId);
    
    if (chat) {
      $("headerTitle").textContent = chat.name;
      renderChatList();
      renderMessages();
      
      // Отмечаем как прочитанное
      if (chat.unread_count > 0) {
        chat.unread_count = 0;
        state.socket?.emit('mark_read', { chatId });
      }
    }
  }

  function sendMessage() {
    const input = $("composeInput");
    const text = input.value.trim();
    
    if (!text || !state.activeChatId) return;
    
    const message = {
      chat_id: state.activeChatId,
      content: text,
      reply_to: state.replyTo?.id || null,
    };
    
    state.socket.emit('send_message', message);
    input.value = "";
    hideReplyBar();
    state.socket.emit('stop_typing', { chatId: state.activeChatId });
  }

  function renderFolderTabs() {
    const folderTabs = $("folderTabs");
    if (!folderTabs) return;
    
    const allFolder = { id: null, name: "Все чаты", icon: "💬" };
    const folders = [allFolder, ...state.folders];
    
    folderTabs.innerHTML = folders.map(folder => `
      <div class="tg-folder-tab ${folder.id === state.activeFolderId ? 'active' : ''}" 
           data-folder-id="${folder.id}">
        ${folder.icon} ${folder.name}
      </div>
    `).join('');
    
    folderTabs.querySelectorAll('.tg-folder-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const folderId = tab.dataset.folderId;
        state.activeFolderId = folderId === 'null' ? null : folderId;
        renderFolderTabs();
        renderChatList();
      });
    });
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
          const users = data.users || [];
          
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
            item.addEventListener('click', async () => {
              const userId = item.dataset.userId;
              if (userId === state.user.id) {
                alert('Нельзя создать чат с самим собой');
                return;
              }
              
              try {
                const createResponse = await fetch('/api/chats/create', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ participantId: userId })
                });
                
                const result = await createResponse.json();
                if (result.error) throw new Error(result.error);
                
                // Обновляем список чатов
                await loadChats();
                renderChatList();
                
                // Переключаем на чаты
                switchTab('chats');
                
              } catch (error) {
                alert('Не удалось создать чат: ' + error.message);
              }
            });
          });
        } catch (error) {
          console.error('Search error:', error);
        }
      }, 300);
    });
  }

  function renderSettings() {
    const settingsList = $("settingsList");
    if (!settingsList) return;
    
    settingsList.innerHTML = `
      <div class="tg-list-item" id="logoutBtn">Выйти из аккаунта</div>
      <div class="tg-list-item">Уведомления</div>
      <div class="tg-list-item">Конфиденциальность</div>
      <div class="tg-list-item">Данные и память</div>
    `;
    
    $("logoutBtn").addEventListener('click', async () => {
      await window.authClient.signOut();
      window.location.href = "/login.html";
    });
  }

  function renderProfileForm() {
    const profileForm = $("profileForm");
    if (!profileForm) return;
    
    const p = state.profile || {};
    profileForm.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <div class="tg-avatar" style="width: 80px; height: 80px; margin: 0 auto 12px; font-size: 32px;">
          ${initials(p.display_name || p.username)}
        </div>
      </div>
      <label style="display:block;margin:10px 0 4px;font-size:13px;color:var(--tg-muted)">Отображаемое имя</label>
      <input id="pfDisplay" type="text" value="${escapeHtml(p.display_name || "")}" 
             style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--tg-panel-2);color:var(--tg-text)" />
      <label style="display:block;margin:10px 0 4px;font-size:13px;color:var(--tg-muted)">Username</label>
      <input id="pfUser" type="text" value="${escapeHtml(p.username || "")}" 
             style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--tg-panel-2);color:var(--tg-text)" />
      <button type="button" id="pfSave" 
              style="margin-top:12px;width:100%;padding:10px;border:none;border-radius:8px;background:var(--tg-accent);color:#fff;font-weight:700;cursor:pointer">
        Сохранить
      </button>
    `;
    
    $("pfSave").onclick = () => {
      state.socket?.emit("profile:update", {
        display_name: $("pfDisplay").value.trim(),
        username: $("pfUser").value.trim(),
      });
    };
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
    } else if (tabName === 'settings') {
      renderSettings();
    } else if (tabName === 'profile') {
      renderProfileForm();
    }
  }

  function updateReplyBar() {
    const replyBar = $("replyBar");
    if (!replyBar) return;
    
    if (state.replyTo) {
      replyBar.style.display = 'flex';
      $("replyBarText").innerHTML = `<strong>Ответ:</strong> ${escapeHtml(state.replyTo.content)}`;
    } else {
      replyBar.style.display = 'none';
    }
  }

  function hideReplyBar() {
    state.replyTo = null;
    updateReplyBar();
  }

  async function loadChats() {
    try {
      const token = await window.authClient.getAccessToken();
      const response = await fetch('/api/chats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      state.chats = data.chats || [];
    } catch (error) {
      console.error('Load chats error:', error);
      // Демо чаты если сервер недоступен
      state.chats = [
        { id: '1', name: 'Али', updated_at: new Date().toISOString(), unread_count: 2, last_message: { content: 'Привет!' } },
        { id: '2', name: 'Боб', updated_at: new Date().toISOString(), unread_count: 0, last_message: { content: 'Как дела?' } },
        { id: '3', name: 'Чарли', updated_at: new Date().toISOString(), unread_count: 1, last_message: { content: 'Встречаемся завтра' } }
      ];
    }
  }

  async function loadFolders() {
    try {
      const token = await window.authClient.getAccessToken();
      const response = await fetch('/api/folders', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      state.folders = data.folders || [];
    } catch (error) {
      console.error('Load folders error:', error);
      state.folders = [];
    }
  }

  function bindSocket() {
    const sock = state.socket;

    sock.on("auth:ready", (payload) => {
      state.profile = payload.profile;
      renderProfileForm();
    });

    sock.on("chat:new", (chat) => {
      state.chats.unshift(chat);
      renderChatList();
    });

    sock.on("message:new", (msg) => {
      state.messages.push(msg);
      if (msg.chat_id === state.activeChatId) {
        renderMessages();
      } else {
        // Обновляем счетчик непрочитанных
        const chat = state.chats.find(c => c.id === msg.chat_id);
        if (chat && msg.sender_id !== state.user.id) {
          chat.unread_count = (chat.unread_count || 0) + 1;
          chat.last_message = msg;
          chat.updated_at = msg.created_at;
          renderChatList();
        }
      }
    });

    sock.on("message:updated", (msg) => {
      const idx = state.messages.findIndex(m => m.id === msg.id);
      if (idx !== -1) {
        state.messages[idx] = msg;
        if (msg.chat_id === state.activeChatId) {
          renderMessages();
        }
      }
    });

    sock.on("chat:updated", (chat) => {
      const idx = state.chats.findIndex(c => c.id === chat.id);
      if (idx !== -1) {
        state.chats[idx] = chat;
        renderChatList();
      }
    });

    sock.on("profile:updated", (profile) => {
      state.profile = profile;
      renderProfileForm();
      $("chatsScreenSub").textContent = profile.email || "";
    });

    sock.on("typing", ({ chatId, user }) => {
      if (chatId === state.activeChatId && user.id !== state.user.id) {
        // Показать индикатор набора текста
      }
    });

    sock.on("stop_typing", ({ chatId }) => {
      // Скрыть индикатор набора текста
    });

    sock.on("error", (err) => {
      console.error("Socket error:", err);
      alert("Ошибка соединения: " + err.message);
    });
  }

  function setupUi() {
    // Отправка сообщения
    $("btnSend").addEventListener('click', sendMessage);
    $("composeInput").addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      } else {
        // Индикатор набора текста
        clearTimeout(state.typingTimer);
        state.socket?.emit('typing', { chatId: state.activeChatId });
        state.typingTimer = setTimeout(() => {
          state.socket?.emit('stop_typing', { chatId: state.activeChatId });
        }, 1000);
      }
    });

    // Кнопка ответа
    $("btnReplyCancel")?.addEventListener('click', hideReplyBar);

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

    // Файлы
    $("fileInput")?.addEventListener('change', onPickFile);
    $("btnAttach")?.addEventListener('click', () => $("fileInput")?.click());

    // Голосовые сообщения
    $("btnVoice")?.addEventListener('click', toggleVoice);

    // Мобильная навигация
    $("btnBackChat")?.addEventListener('click', () => {
      if (window.innerWidth <= 767) {
        document.querySelector('.tg-app')?.classList.add('hide-chat-mobile');
      }
    });

    // Долгий нажатие на сообщения
    $("messages")?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const msgEl = e.target.closest('.tg-message');
      if (msgEl) {
        const msgId = msgEl.dataset.messageId;
        showMessageMenu(msgId, e.pageX, e.pageY);
      }
    });
  }

  function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !state.activeChatId) return;
    if (f.size > 4 * 1024 * 1024) {
      alert("Файл больше 4 МБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.socket?.emit("send_message", {
        chat_id: state.activeChatId,
        content: f.name,
        file_url: reader.result,
        file_type: f.type || "application/octet-stream",
      });
    };
    reader.readAsDataURL(f);
  }

  async function toggleVoice() {
    if (!state.activeChatId) return;
    if (!state.recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioChunks = [];
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (ev) => audioChunks.push(ev.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          const r = new FileReader();
          r.onload = () => {
            state.socket?.emit("send_message", {
              chat_id: state.activeChatId,
              content: "Голосовое сообщение",
              file_url: r.result,
              file_type: "audio/webm",
            });
          };
          r.readAsDataURL(blob);
          stream.getTracks().forEach((t) => t.stop());
        };
        mediaRecorder.start();
        state.recording = true;
        state.audioChunks = audioChunks;
        state.mediaRecorder = mediaRecorder;
        $("btnVoice").style.color = "var(--tg-danger)";
      } catch {
        alert("Нет доступа к микрофону.");
      }
    } else {
      state.mediaRecorder?.stop();
      state.recording = false;
      $("btnVoice").style.color = "";
    }
  }

  function showMessageMenu(msgId, x, y) {
    const msg = state.messages.find(m => m.id === msgId);
    if (!msg) return;

    // Простое контекстное меню
    if (confirm(`Ответить на сообщение: "${msg.content}"?`)) {
      state.replyTo = msg;
      updateReplyBar();
      $("composeInput")?.focus();
    }
  }

  async function boot() {
    const {
      data: { session },
      error,
    } = await window.authClient.getSession();
    if (error || !session) {
      window.location.href = "/login.html";
      return;
    }

    state.user = session.user;
    $("chatsScreenSub").textContent = session.user.email || "";

    try {
      state.socket = await window.authClient.connectAuthenticatedSocket((opts) =>
        io(window.location.origin, opts)
      );
    } catch (e) {
      console.error(e);
      alert("Не удалось подключить сокет. Проверьте сервер и вход.");
      return;
    }

    bindSocket();
    await loadFolders();
    await loadChats();
    renderFolderTabs();
    renderChatList();
    setupUi();
    renderSettings();
    renderProfileForm();

    // Мобильная адаптация
    if (window.innerWidth <= 767) {
      document.querySelector('.tg-app')?.classList.add('hide-chat-mobile');
    }
  }

  // Запуск
  document.addEventListener("DOMContentLoaded", boot);
})();
