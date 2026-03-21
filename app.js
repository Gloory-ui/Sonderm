/* Sonderm — клиент: чаты, сокеты, папки, ответ/пересылка/реакции (упрощённо, но цельно) */

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
    peerByChat: {},
    folders: [],
    folderChatMap: {},
    activeFolderId: null,
    replyTo: null,
    forwardIds: [],
    forwardPickMode: false,
    ctxMessageId: null,
    reactionMessageId: null,
    typingTimer: null,
    typingStopTimer: null,
    recording: false,
    mediaRecorder: null,
    audioChunks: [],
    readsCache: {},
    pinnedLocalDismiss: new Set(),
    longPressTimer: null,
    pinnedChatIds: [],
    deliveryByMessage: {},
    readByMessage: {},
    forwardProfileCache: {},
    selectedFolderIcon: "📁",
    folderEditIcon: "📁",
    editingFolderId: null,
    addMemberPick: new Set(),
    dragChatId: null,
    chatLongPressTimer: null,
    folderLongPressTimer: null,
    edgeSwipeStartX: null,
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

  function firstUrl(text) {
    const m = String(text).match(/https?:\/\/[^\s]+/i);
    return m ? m[0] : null;
  }

  function linkHost(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
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

  function lastReadKey(chatId) {
    return `sonderm_lr_${state.user.id}_${chatId}`;
  }

  function getUnreadCount(chatId, lastAt) {
    if (!lastAt) return 0;
    const raw = localStorage.getItem(lastReadKey(chatId));
    if (!raw) return 1;
    const t = new Date(raw).getTime();
    return new Date(lastAt).getTime() > t ? 1 : 0;
  }

  function markChatReadLocal(chatId, whenIso) {
    localStorage.setItem(lastReadKey(chatId), whenIso || new Date().toISOString());
  }

  function hiddenKey() {
    return `sonderm_hide_${state.user.id}`;
  }

  function getHiddenSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(hiddenKey()) || "[]"));
    } catch {
      return new Set();
    }
  }

  function hideMessageLocal(id) {
    const s = getHiddenSet();
    s.add(id);
    localStorage.setItem(hiddenKey(), JSON.stringify([...s]));
  }

  function isMobile() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function setMobileLayout(mode) {
    const root = $("appRoot");
    if (!root) return;
    if (mode === "chat") {
      root.classList.remove("hide-chat-mobile");
      root.classList.add("hide-list-mobile");
    } else {
      root.classList.add("hide-chat-mobile");
      root.classList.remove("hide-list-mobile");
    }
  }

  function showScreen(name) {
    const map = {
      chats: "screenChats",
      contacts: "screenContacts",
      settings: "screenSettings",
      profile: "screenProfile",
    };
    Object.entries(map).forEach(([key, id]) => {
      const el = $(id);
      if (el) el.classList.toggle("visible", key === name);
    });
    $("chatsScreenTitle").textContent =
      name === "chats"
        ? "Чаты"
        : name === "contacts"
          ? "Контакты"
          : name === "settings"
            ? "Настройки"
            : "Профиль";
  }

  function syncTabButtons(activeTab) {
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-tab") === activeTab);
    });
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
    const sb = window.authClient.supabase;

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
    window.SondermWebRTC?.attachSocket?.(state.socket);
    setupCallUi();
    await loadFolders();
    await loadChats();
    renderFolderTabs();
    renderChatList();
    setupUi();
    buildEmojiPanels();
    renderSettings();
    renderProfileForm();
    registerServiceWorker();

    if (isMobile()) setMobileLayout("list");
  }

  function bindSocket() {
    const sock = state.socket;

    sock.on("auth:ready", (payload) => {
      state.profile = payload.profile;
    });

    sock.on("app:error", (p) => console.warn("app:error", p?.message));

    sock.on("saved_chat_ready", async () => {
      await loadChats();
      renderChatList();
    });

    sock.on("private_chat_ready", async (p) => {
      await loadChats();
      renderChatList();
      if (p?.chat?.id) await openChat(p.chat.id);
    });

    sock.on("new_message", async (payload) => {
      const msg = payload.message;
      if (!msg) return;
      await touchChatLast(msg.chat_id, msg);
      if (msg.sender_id !== state.user.id) {
        state.socket.emit("message_ack_delivered", {
          messageId: msg.id,
          chatId: msg.chat_id,
        });
      }
      if (msg.chat_id === state.activeChatId) {
        let sender = payload.sender;
        if (!sender) sender = await fetchProfile(msg.sender_id);
        state.messages.push(enrichMessage(msg, sender, []));
        await loadReadStateForMessages();
        renderMessages();
        scrollMessagesBottom();
      } else {
        renderChatList();
      }
    });

    sock.on("user_typing", (p) => {
      if (p.chatId !== state.activeChatId) return;
      $("headerSub").textContent = `${p.username || "Кто-то"} печатает…`;
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => {
        headerStatusTextAsync().then((t) => {
          $("headerSub").textContent = t;
        });
      }, 2000);
    });

    sock.on("user_stopped_typing", (p) => {
      if (p.chatId !== state.activeChatId) return;
      headerStatusTextAsync().then((t) => {
        $("headerSub").textContent = t;
      });
    });

    sock.on("reaction_updated", (p) => {
      const msg = state.messages.find((m) => m.id === p.messageId);
      if (msg) {
        msg._reactions = aggregateReactionRows(p.reactions, state.user.id);
        renderMessages();
      }
    });

    sock.on("message_deleted", (p) => {
      if (p.forEveryone) {
        state.messages = state.messages.filter((m) => m.id !== p.messageId);
      } else {
        hideMessageLocal(p.messageId);
        state.messages = state.messages.filter((m) => m.id !== p.messageId);
      }
      renderMessages();
      renderChatList();
    });

    sock.on("message_pinned", async (p) => {
      if (p.chatId === state.activeChatId) await refreshPinnedBar();
    });

    sock.on("user_status", () => {
      renderChatList();
      if (state.activeChatId) {
        headerStatusTextAsync().then((t) => {
          $("headerSub").textContent = t;
        });
      }
    });

    sock.on("profile:updated", (prof) => {
      state.profile = prof;
      renderProfileForm();
    });

    sock.on("pinned_chats", (p) => {
      state.pinnedChatIds = Array.isArray(p.chatIds) ? p.chatIds : [];
      renderChatList();
    });

    sock.on("chat_pinned", (p) => {
      state.pinnedChatIds = Array.isArray(p.chatIds) ? p.chatIds : [];
      renderChatList();
    });

    sock.on("message_delivery_update", (p) => {
      if (!state.deliveryByMessage[p.messageId]) state.deliveryByMessage[p.messageId] = new Set();
      state.deliveryByMessage[p.messageId].add(p.byUserId);
      renderMessages();
      renderChatList();
    });

    sock.on("participants_updated", async (p) => {
      if (p.chatId === state.activeChatId) {
        await loadMessages(p.chatId);
        renderMessages();
      }
      await loadChats();
      renderChatList();
    });

    const folderRefresh = async () => {
      await loadFolders();
      renderFolderTabs();
      renderChatList();
    };

    sock.on("folder_created", folderRefresh);
    sock.on("folder_updated", folderRefresh);
    sock.on("folder_deleted", folderRefresh);
    sock.on("folder_chat_added", folderRefresh);
    sock.on("folder_chat_removed", folderRefresh);
  }

  function aggregateReactionRows(rows, myId) {
    const list = rows || [];
    return list.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      mine: (r.userIds || []).includes(myId),
    }));
  }

  async function loadFolders() {
    const sb = window.authClient.supabase;
    const uid = state.user.id;
    const { data: folders, error } = await sb
      .from("chat_folders")
      .select("*")
      .eq("user_id", uid)
      .order("sort_order", { ascending: true });
    if (error) {
      console.warn(error);
      state.folders = [];
    } else {
      state.folders = folders || [];
    }

    const { data: links, error: e2 } = await sb.from("folder_chats").select("folder_id, chat_id");
    if (e2) console.warn(e2);
    state.folderChatMap = {};
    for (const row of links || []) {
      if (!state.folderChatMap[row.folder_id]) state.folderChatMap[row.folder_id] = new Set();
      state.folderChatMap[row.folder_id].add(row.chat_id);
    }
  }

  async function loadChats() {
    const sb = window.authClient.supabase;
    const { data, error } = await sb
      .from("participants")
      .select(
        "chat_id, role, chats ( id, type, name, avatar_url, last_message_at, is_pinned, is_muted, description, created_by )"
      )
      .eq("user_id", state.user.id);

    if (error) {
      console.error(error);
      state.chats = [];
      return;
    }

    const rows = (data || [])
      .map((r) => {
        const c = r.chats;
        if (!c || !c.id) return null;
        return {
          ...c,
          _role: r.role,
          chat_id: r.chat_id,
        };
      })
      .filter(Boolean);

    const enriched = [];
    for (const c of rows) {
      if (!c || !c.id) continue;
      const last = await fetchLastMessage(c.id);
      const title = await resolveChatTitle(c);
      const { data: parts } = await sb.from("participants").select("user_id").eq("chat_id", c.id);
      const otherIds = (parts || []).map((p) => p.user_id).filter((id) => id !== state.user.id);
      enriched.push({
        ...c,
        _title: title,
        _last: last,
        _otherIds: otherIds,
        _unread: getUnreadCount(c.id, last?.created_at || c.last_message_at),
      });
    }

    enriched.sort((a, b) => {
      const ta = new Date(a._last?.created_at || a.last_message_at || 0).getTime();
      const tb = new Date(b._last?.created_at || b.last_message_at || 0).getTime();
      return tb - ta;
    });

    const lastMsgIds = enriched.map((c) => c._last?.id).filter(Boolean);
    if (lastMsgIds.length) {
      const { data: reads } = await sb
        .from("message_reads")
        .select("message_id, user_id")
        .in("message_id", lastMsgIds);
      for (const r of reads || []) {
        if (!state.readByMessage[r.message_id]) state.readByMessage[r.message_id] = new Set();
        state.readByMessage[r.message_id].add(r.user_id);
      }
    }

    state.chats = enriched;
  }

  function isChatSaved(c) {
    return c?.description === "sonderm_saved" || c?._title === "Избранное";
  }

  async function loadReadStateForMessages() {
    const sb = window.authClient.supabase;
    const chat = state.chats.find((x) => x.id === state.activeChatId);
    if (!chat) return;
    const out = state.messages.filter((m) => m.sender_id === state.user.id && !m.is_deleted).map((m) => m.id);
    state.readByMessage = {};
    if (!out.length) return;
    const { data, error } = await sb.from("message_reads").select("message_id, user_id").in("message_id", out);
    if (error) return;
    for (const r of data || []) {
      if (!state.readByMessage[r.message_id]) state.readByMessage[r.message_id] = new Set();
      state.readByMessage[r.message_id].add(r.user_id);
    }
  }

  function otherParticipantIds(chatId) {
    const parts = state.participantsByChat[chatId] || [];
    return parts.filter((id) => id !== state.user.id);
  }

  function renderMessageTicks(m) {
    if (m.sender_id !== state.user.id) return null;
    const chatId = state.activeChatId;
    const others = otherParticipantIds(chatId);
    const delSet = state.deliveryByMessage[m.id] || new Set();
    const readSet = state.readByMessage[m.id] || new Set();
    const allDelivered = others.length > 0 && others.every((id) => delSet.has(id));
    const allRead = others.length > 0 && others.every((id) => readSet.has(id));
    const span = document.createElement("span");
    span.className = "tg-tick";
    if (allRead) {
      span.classList.add("read");
      span.textContent = "✓✓";
      span.title = readersTitle(others, readSet);
    } else if (allDelivered) {
      span.classList.add("delivered");
      span.textContent = "✓✓";
      span.title = "Доставлено";
    } else {
      span.classList.add("sent");
      span.textContent = "✓";
      span.title = "Отправлено";
    }
    return span;
  }

  function readersTitle(others, readSet) {
    const n = others.filter((id) => readSet.has(id)).length;
    return others.length ? `Прочитано ${n} из ${others.length}` : "Прочитано";
  }

  async function fetchLastMessage(chatId) {
    const sb = window.authClient.supabase;
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  async function resolveChatTitle(chat) {
    if (chat.description === "sonderm_saved") return "Избранное";
    if (chat.name === "Избранное" && (await isSingleParticipant(chat.id))) {
      return "Избранное";
    }
    if (chat.type === "group") return chat.name || "Группа";
    const otherId = await getOtherPrivateUserId(chat.id);
    if (!otherId) return chat.name || "Чат";
    const sb = window.authClient.supabase;
    const { data } = await sb
      .from("profiles")
      .select("username, display_name")
      .eq("id", otherId)
      .maybeSingle();
    state.peerByChat[chat.id] = otherId;
    return data?.display_name || data?.username || "Контакт";
  }

  async function isSingleParticipant(chatId) {
    const sb = window.authClient.supabase;
    const { count, error } = await sb
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("chat_id", chatId);
    if (error) return false;
    return count === 1;
  }

  async function getOtherPrivateUserId(chatId) {
    const sb = window.authClient.supabase;
    const { data, error } = await sb.from("participants").select("user_id").eq("chat_id", chatId);
    if (error || !data) return null;
    const ids = data.map((r) => r.user_id);
    const others = ids.filter((id) => id !== state.user.id);
    return others[0] || null;
  }

  async function touchChatLast(chatId, msg) {
    const chat = state.chats.find((c) => c.id === chatId);
    if (chat) {
      chat._last = msg;
      chat.last_message_at = msg.created_at;
      renderChatList();
    } else {
      await loadChats();
      renderChatList();
    }
  }

  function previewText(msg) {
    if (!msg) return "";
    if (msg.is_deleted) return "Сообщение удалено";
    if (msg.file_type && msg.file_type.startsWith("image/")) return "📷 Фото";
    if (msg.file_type && msg.file_type.startsWith("video/")) return "🎬 Видео";
    if (msg.file_type && msg.file_type.startsWith("audio/")) return "🎤 Голосовое";
    if (msg.file_url && !msg.content) return "📁 Файл";
    return (msg.content || "").slice(0, 80);
  }

  const FOLDER_ICONS = ["📁", "📚", "💼", "🎮", "❤️", "✈️", "🏠", "⭐", "🎵", "🎬", "⚽", "🛒", "🐱", "☕"];

  function buildFolderIconPicker(container, selected, onPick) {
    if (!container) return;
    container.innerHTML = "";
    for (const ic of FOLDER_ICONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ic;
      if (ic === selected) b.classList.add("selected");
      b.addEventListener("click", () => {
        container.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        onPick(ic);
      });
      container.appendChild(b);
    }
  }

  function openFolderEditor(f) {
    state.editingFolderId = f.id;
    $("folderEditName").value = f.name;
    state.folderEditIcon = f.icon || "📁";
    buildFolderIconPicker($("folderEditIconPicker"), state.folderEditIcon, (ic) => {
      state.folderEditIcon = ic;
    });
    $("modalFolderEdit").classList.add("visible");
  }

  function renderFolderTabs() {
    const host = $("folderTabs");
    host.innerHTML = "";

    const all = document.createElement("button");
    all.type = "button";
    all.className = `tg-folder-tab${state.activeFolderId == null ? " active" : ""}`;
    all.textContent = "Все чаты";
    all.addEventListener("click", () => {
      state.activeFolderId = null;
      renderFolderTabs();
      renderChatList();
    });
    host.appendChild(all);

    for (const f of state.folders) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tg-folder-tab${state.activeFolderId === f.id ? " active" : ""}`;
      b.textContent = `${f.icon || "📁"} ${f.name}`;
      b.addEventListener("click", () => {
        state.activeFolderId = f.id;
        renderFolderTabs();
        renderChatList();
      });
      b.addEventListener("dragover", (e) => {
        e.preventDefault();
        b.classList.add("drop-target");
      });
      b.addEventListener("dragleave", () => b.classList.remove("drop-target"));
      b.addEventListener("drop", (e) => {
        e.preventDefault();
        b.classList.remove("drop-target");
        if (state.dragChatId) {
          state.socket.emit("add_chat_to_folder", { folderId: f.id, chatId: state.dragChatId });
        }
      });
      b.addEventListener(
        "touchstart",
        () => {
          state.folderLongPressTimer = setTimeout(() => openFolderEditor(f), 650);
        },
        { passive: true }
      );
      b.addEventListener("touchend", () => clearTimeout(state.folderLongPressTimer));
      b.addEventListener("touchmove", () => clearTimeout(state.folderLongPressTimer));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openFolderEditor(f);
      });
      host.appendChild(b);
    }
  }

  function filteredChats() {
    if (state.activeFolderId == null) return state.chats;
    const set = state.folderChatMap[state.activeFolderId];
    if (!set) return [];
    return state.chats.filter((c) => set.has(c.id));
  }

  function listRowTicksEl(c) {
    const last = c._last;
    if (!last || last.sender_id !== state.user.id) return null;
    const others = c._otherIds || [];
    const delSet = state.deliveryByMessage[last.id] || new Set();
    const readSet = state.readByMessage[last.id] || new Set();
    const allDelivered = others.length > 0 && others.every((id) => delSet.has(id));
    const allRead = others.length > 0 && others.every((id) => readSet.has(id));
    const el = document.createElement("div");
    el.className = "tg-check tg-tick";
    if (allRead) el.classList.add("read");
    else if (allDelivered) el.classList.add("delivered");
    else el.classList.add("sent");
    el.textContent = allRead || allDelivered ? "✓✓" : "✓";
    el.title = allRead ? readersTitle(others, readSet) : allDelivered ? "Доставлено" : "Отправлено";
    return el;
  }

  function openChatRowMenu(c, x, y) {
    state.ctxChatId = c.id;
    const menu = $("ctxMenu");
    const body = $("ctxBody");
    body.innerHTML = "";
    const pinned = state.pinnedChatIds.includes(c.id);
    const actions = pinned
      ? [["Открепить чат", () => state.socket.emit("unpin_chat", { chatId: c.id })]]
      : [["Закрепить чат", () => state.socket.emit("pin_chat", { chatId: c.id })]];
    if (!isChatSaved(c)) {
      actions.push(["В папку…", () => openAddToFolderModal(c.id)]);
    }
    for (const [label, fn] of actions) {
      const div = document.createElement("div");
      div.className = "tg-ctx-item";
      div.textContent = label;
      div.addEventListener("click", () => {
        fn();
        menu.classList.remove("visible");
      });
      body.appendChild(div);
    }
    menu.classList.add("visible");
    body.style.left = `${Math.min(x || 40, window.innerWidth - 220)}px`;
    body.style.top = `${Math.min(y || 80, window.innerHeight - 200)}px`;
    body.style.transform = "";
  }

  function openAddToFolderModal(chatId) {
    state.addToFolderChatId = chatId;
    const body = $("addToFolderList");
    body.innerHTML = "";
    for (const f of state.folders) {
      const row = document.createElement("div");
      row.className = "tg-list-item";
      row.textContent = `${f.icon || "📁"} ${f.name}`;
      row.addEventListener("click", () => {
        state.socket.emit("add_chat_to_folder", { folderId: f.id, chatId });
        $("modalAddToFolder").classList.remove("visible");
      });
      body.appendChild(row);
    }
    $("modalAddToFolder").classList.add("visible");
  }

  function renderChatList() {
    const host = $("chatList");
    const q = ($("chatSearch").value || "").toLowerCase();
    host.innerHTML = "";

    const base = filteredChats().filter((c) => (c._title || "").toLowerCase().includes(q));
    const pinOrder = state.pinnedChatIds.filter((id) => base.some((c) => c.id === id));
    const pinSet = new Set(pinOrder);
    const rest = base.filter((c) => !pinSet.has(c.id));
    rest.sort((a, b) => {
      const ta = new Date(a._last?.created_at || a.last_message_at || 0).getTime();
      const tb = new Date(b._last?.created_at || b.last_message_at || 0).getTime();
      return tb - ta;
    });

    const ordered = [
      ...pinOrder.map((id) => base.find((c) => c.id === id)).filter(Boolean),
      ...rest,
    ];

    let sepDone = false;
    for (let i = 0; i < ordered.length; i += 1) {
      const c = ordered[i];
      if (!sepDone && pinOrder.length && i === pinOrder.length) {
        const sep = document.createElement("div");
        sep.className = "tg-chat-sep";
        sep.textContent = "Остальные чаты";
        host.appendChild(sep);
        sepDone = true;
      }

      const row = document.createElement("div");
      row.className = `tg-chat-item${c.id === state.activeChatId ? " active" : ""}`;
      row.dataset.chatId = c.id;
      row.addEventListener("click", () => openChat(c.id));

      if (!isChatSaved(c)) {
        row.draggable = true;
        row.addEventListener("dragstart", (e) => {
          state.dragChatId = c.id;
          e.dataTransfer.effectAllowed = "copy";
        });
      }

      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openChatRowMenu(c, e.clientX, e.clientY);
      });
      row.addEventListener(
        "touchstart",
        () => {
          state.chatLongPressTimer = setTimeout(() => openChatRowMenu(c, 0, 0), 600);
        },
        { passive: true }
      );
      row.addEventListener("touchend", () => clearTimeout(state.chatLongPressTimer));
      row.addEventListener("touchmove", () => clearTimeout(state.chatLongPressTimer));

      const av = document.createElement("div");
      av.className = "tg-avatar";
      av.textContent = initials(c._title);

      const main = document.createElement("div");
      main.className = "tg-chat-main";
      const top = document.createElement("div");
      top.className = "tg-chat-top";
      const name = document.createElement("div");
      name.className = "tg-chat-name";
      name.textContent = c._title;
      top.appendChild(name);
      if (state.pinnedChatIds.includes(c.id)) {
        const pin = document.createElement("span");
        pin.className = "tg-pin";
        pin.textContent = "📌";
        top.appendChild(pin);
      }
      if (c.is_muted) {
        const m = document.createElement("span");
        m.className = "tg-muted-ic";
        m.textContent = "🔕";
        top.appendChild(m);
      }
      const preview = document.createElement("div");
      preview.className = "tg-chat-preview";
      const last = c._last;
      let left = previewText(last);
      if (last && last.sender_id === state.user.id) left = `Вы: ${left}`;
      preview.textContent = left;

      main.appendChild(top);
      main.appendChild(preview);

      const meta = document.createElement("div");
      meta.className = "tg-chat-meta";
      const time = document.createElement("div");
      time.className = "tg-time";
      time.textContent = formatListTime(last?.created_at || c.last_message_at);
      meta.appendChild(time);

      const tickEl = listRowTicksEl(c);
      if (tickEl) meta.appendChild(tickEl);

      if (c._unread > 0 && c.id !== state.activeChatId) {
        const u = document.createElement("div");
        u.className = "tg-unread";
        u.textContent = String(c._unread);
        meta.appendChild(u);
      }

      row.appendChild(av);
      row.appendChild(main);
      row.appendChild(meta);
      host.appendChild(row);
    }
  }

  async function openChat(chatId) {
    state.activeChatId = chatId;
    state.pinnedBarCollapsed = false;
    state.replyTo = null;
    updateReplyBar();
    state.forwardIds = [];
    state.forwardPickMode = false;
    updateForwardBar();

    const chat = state.chats.find((c) => c.id === chatId);
    const title = chat?._title || "Чат";
    $("headerTitle").textContent = title;
    $("headerAvatar").textContent = initials(title);

    state.socket.emit("join_chat", { chatId });
    await loadMessages(chatId);
    await refreshPinnedBar();
    renderMessages();
    scrollMessagesBottom();

    const last = chat?._last;
    markChatReadLocal(chatId, last?.created_at || new Date().toISOString());
    if (chat) chat._unread = 0;

    const incomingIds = state.messages
      .filter((m) => m.sender_id !== state.user.id && !m.is_deleted)
      .map((m) => m.id);
    if (incomingIds.length) {
      state.socket.emit("mark_messages_read", { chatId, messageIds: incomingIds });
    }

    headerStatusTextAsync().then((t) => {
      $("headerSub").textContent = t;
    });
    renderChatList();

    if (isMobile()) setMobileLayout("chat");
  }

  async function headerStatusTextAsync() {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    if (!chat) return "";
    if (chat.type === "group") {
      return `Участников: ${state.participantsByChat[chat.id]?.length || "…"}`;
    }
    const peer = state.peerByChat[chat.id];
    if (!peer) return "";
    const p = await fetchProfile(peer);
    return p?.is_online ? "в сети" : "был(а) недавно";
  }

  async function loadMessages(chatId) {
    const sb = window.authClient.supabase;
    const hidden = getHiddenSet();

    const { data: parts } = await sb.from("participants").select("user_id").eq("chat_id", chatId);
    state.participantsByChat[chatId] = (parts || []).map((p) => p.user_id);

    const { data: rows, error } = await sb
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error(error);
      state.messages = [];
      return;
    }

    const visible = (rows || []).filter((m) => !hidden.has(m.id));
    const ids = visible.map((m) => m.id);
    let reactRows = [];
    if (ids.length) {
      const { data: r } = await sb.from("message_reactions").select("message_id, emoji, user_id").in("message_id", ids);
      reactRows = r || [];
    }

    const byMsg = {};
    for (const r of reactRows) {
      if (!byMsg[r.message_id]) byMsg[r.message_id] = [];
      byMsg[r.message_id].push(r);
    }

    state.messages = [];
    for (const m of visible) {
      if (m.forwarded_from_user_id && !state.forwardProfileCache[m.forwarded_from_user_id]) {
        state.forwardProfileCache[m.forwarded_from_user_id] = await fetchProfile(m.forwarded_from_user_id);
      }
      const agg = aggregateRawReactions(byMsg[m.id] || [], state.user.id);
      const sender = await fetchProfile(m.sender_id);
      state.messages.push(enrichMessage(m, sender, agg));
    }
    await loadReadStateForMessages();
  }

  function aggregateRawReactions(rows, myId) {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.emoji)) map.set(r.emoji, { emoji: r.emoji, count: 0, userIds: [] });
      const b = map.get(r.emoji);
      b.count += 1;
      b.userIds.push(r.user_id);
    }
    return [...map.values()].map((b) => ({
      emoji: b.emoji,
      count: b.count,
      mine: b.userIds.includes(myId),
    }));
  }

  async function fetchProfile(userId) {
    const sb = window.authClient.supabase;
    const { data } = await sb
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_online, last_seen")
      .eq("id", userId)
      .maybeSingle();
    return data;
  }

  function enrichMessage(m, sender, reactions = []) {
    return {
      ...m,
      _sender: sender,
      _reactions: reactions,
    };
  }

  async function refreshPinnedBar() {
    const bar = $("pinnedBar");
    const chips = $("pinnedChips");
    const sb = window.authClient.supabase;
    if (state.pinnedBarCollapsed || !state.activeChatId) {
      bar.classList.remove("visible");
      return;
    }
    const { data: rows } = await sb
      .from("messages")
      .select("id, content, file_type, is_deleted, is_pinned")
      .eq("chat_id", state.activeChatId)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false });

    const list = (rows || []).filter((p) => !state.pinnedLocalDismiss.has(p.id));
    if (!list.length) {
      bar.classList.remove("visible");
      return;
    }
    bar.classList.add("visible");
    chips.innerHTML = "";
    for (const p of list) {
      const chip = document.createElement("div");
      chip.className = "tg-pinned-chip";
      chip.textContent = `📌 ${previewText(p)}`;
      chip.addEventListener("click", () => scrollToMessage(p.id));
      chips.appendChild(chip);
    }
  }

  function scrollToMessage(messageId) {
    const host = $("messages");
    const el = host.querySelector(`[data-id="${messageId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function scrollMessagesBottom() {
    const el = $("messages");
    el.scrollTop = el.scrollHeight;
  }

  function renderMessages() {
    const host = $("messages");
    host.innerHTML = "";
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    const isGroup = chat?.type === "group";

    for (const m of state.messages) {
      if (m.is_deleted) {
        const wrap = document.createElement("div");
        wrap.style.textAlign = "center";
        wrap.style.color = "var(--tg-muted)";
        wrap.style.fontSize = "13px";
        wrap.textContent = "Сообщение удалено";
        host.appendChild(wrap);
        continue;
      }

      const row = document.createElement("div");
      row.className = `tg-row${m.sender_id === state.user.id ? " out" : ""}`;

      if (isGroup && m.sender_id !== state.user.id) {
        const av = document.createElement("div");
        av.className = "tg-avatar sm";
        av.textContent = initials(m._sender?.display_name || m._sender?.username || "?");
        row.appendChild(av);
      }

      const bubble = document.createElement("div");
      bubble.className = `tg-bubble${m.sender_id === state.user.id ? " out" : " in"}`;
      bubble.dataset.id = m.id;

      if (m.forwarded_from_user_id) {
        const f = document.createElement("div");
        f.className = "fwd";
        const fp = state.forwardProfileCache[m.forwarded_from_user_id];
        f.textContent = fp ? `Переслано от ${fp.display_name || fp.username}` : "Переслано";
        bubble.appendChild(f);
      }

      if (m.reply_to_message_id) {
        const prev = state.messages.find((x) => x.id === m.reply_to_message_id);
        const rp = document.createElement("div");
        rp.className = "reply-preview";
        rp.textContent = prev ? previewText(prev) : "Ответ на сообщение";
        bubble.appendChild(rp);
      }

      if (m.file_url && m.file_type && m.file_type.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "media";
        img.src = m.file_url;
        img.alt = "";
        bubble.appendChild(img);
      } else if (m.file_url && m.file_type && m.file_type.startsWith("video/")) {
        const vid = document.createElement("video");
        vid.className = "media";
        vid.controls = true;
        vid.src = m.file_url;
        bubble.appendChild(vid);
      } else if (m.file_url && m.file_type && m.file_type.startsWith("audio/")) {
        const aud = document.createElement("audio");
        aud.className = "media";
        aud.controls = true;
        aud.src = m.file_url;
        bubble.appendChild(aud);
      } else if (m.file_url) {
        const a = document.createElement("a");
        a.href = m.file_url;
        a.target = "_blank";
        a.textContent = "📎 Вложение";
        bubble.appendChild(a);
      }

      if (m.content) {
        const body = document.createElement("div");
        body.innerHTML = formatRichText(m.content);
        bubble.appendChild(body);
      }

      const url = firstUrl(m.content || "");
      if (url) {
        const lp = document.createElement("div");
        lp.className = "tg-link-preview";
        lp.textContent = `🔗 ${linkHost(url)}`;
        bubble.appendChild(lp);
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      const tspan = document.createElement("span");
      tspan.textContent = formatTime(m.created_at);
      meta.appendChild(tspan);
      if (m.sender_id === state.user.id) {
        const tick = renderMessageTicks(m);
        if (tick) meta.appendChild(tick);
      }
      bubble.appendChild(meta);

      if (m._reactions && m._reactions.length) {
        const rx = document.createElement("div");
        rx.className = "tg-reactions";
        for (const r of m._reactions) {
          const pill = document.createElement("span");
          pill.className = "tg-reaction-pill";
          pill.textContent = `${r.emoji} ${r.count}`;
          rx.appendChild(pill);
        }
        bubble.appendChild(rx);
      }

      if (state.forwardPickMode) {
        bubble.style.outline = state.forwardIds.includes(m.id) ? "2px solid var(--tg-accent)" : "";
      }

      bubble.addEventListener("click", () => {
        if (state.forwardPickMode) {
          toggleForwardSelect(m.id);
        }
      });

      bubble.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openCtxMenu(e.clientX, e.clientY, m.id);
      });

      bubble.addEventListener(
        "touchstart",
        () => {
          state.longPressTimer = setTimeout(() => openCtxMenu(0, 0, m.id, true), 550);
        },
        { passive: true }
      );
      bubble.addEventListener("touchend", () => clearTimeout(state.longPressTimer));
      bubble.addEventListener("touchmove", () => clearTimeout(state.longPressTimer));

      row.appendChild(bubble);
      host.appendChild(row);
    }
  }

  function toggleForwardSelect(id) {
    const i = state.forwardIds.indexOf(id);
    if (i >= 0) state.forwardIds.splice(i, 1);
    else state.forwardIds.push(id);
    updateForwardBar();
    renderMessages();
  }

  function updateForwardBar() {
    const bar = $("forwardBar");
    const on = state.forwardPickMode && state.forwardIds.length > 0;
    bar.classList.toggle("visible", state.forwardPickMode);
    $("forwardBarText").textContent = state.forwardPickMode
      ? `Выбрано: ${state.forwardIds.length}. Нажмите «Переслать» в меню сообщения или кнопку ниже.`
      : "";
    $("btnForwardCancel").onclick = () => {
      state.forwardPickMode = false;
      state.forwardIds = [];
      updateForwardBar();
      renderMessages();
    };
  }

  function openCtxMenu(x, y, messageId, center) {
    state.ctxMessageId = messageId;
    const menu = $("ctxMenu");
    const body = $("ctxBody");
    body.innerHTML = "";
    const m = state.messages.find((x) => x.id === messageId);
    const actions = [
      [
        "Цитировать",
        () => {
          const t = previewText(m);
          const ta = $("composeInput");
          ta.value = `${ta.value ? ta.value + "\n" : ""}> ${t}\n`;
          ta.focus();
        },
      ],
      ["Ответить", () => startReply(messageId)],
      ["Копировать", () => copyMessage(messageId)],
      ["Выбрать для пересылки", () => startForwardPick(messageId)],
      ["Реакция", () => openReactionModal(messageId)],
      ["Закрепить", () => pinMsg(messageId, true)],
      ["Открепить", () => pinMsg(messageId, false)],
      ["Удалить у меня", () => delMsg(messageId, false)],
      ["Удалить для всех", () => delMsg(messageId, true)],
    ];
    for (const [label, fn] of actions) {
      const div = document.createElement("div");
      div.className = "tg-ctx-item";
      div.textContent = label;
      div.addEventListener("click", () => {
        fn();
        closeCtx();
      });
      body.appendChild(div);
    }
    const extra = document.createElement("div");
    extra.className = "tg-ctx-item";
    extra.textContent = "Переслать в чат…";
    extra.addEventListener("click", () => {
      closeCtx();
      openForwardModal();
    });
    body.appendChild(extra);

    menu.classList.add("visible");
    const rect = { left: x, top: y };
    if (center || !x) {
      body.style.left = "50%";
      body.style.top = "40%";
      body.style.transform = "translate(-50%, -50%)";
    } else {
      body.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
      body.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
      body.style.transform = "";
    }
  }

  function closeCtx() {
    $("ctxMenu").classList.remove("visible");
  }

  function startReply(messageId) {
    const m = state.messages.find((x) => x.id === messageId);
    state.replyTo = m || { id: messageId };
    updateReplyBar();
  }

  function updateReplyBar() {
    const bar = $("replyBar");
    if (!state.replyTo) {
      bar.classList.remove("visible");
      return;
    }
    bar.classList.add("visible");
    $("replyBarText").textContent = previewText(state.replyTo);
    $("btnReplyCancel").onclick = () => {
      state.replyTo = null;
      updateReplyBar();
    };
  }

  function copyMessage(messageId) {
    const m = state.messages.find((x) => x.id === messageId);
    if (m?.content) navigator.clipboard.writeText(m.content);
  }

  function startForwardPick(messageId) {
    state.forwardPickMode = true;
    state.forwardIds = [messageId];
    updateForwardBar();
    renderMessages();
  }

  function openForwardModal() {
    const modal = $("modalForward");
    const body = $("forwardTargets");
    body.innerHTML = "";
    for (const c of state.chats) {
      if (c.id === state.activeChatId) continue;
      const row = document.createElement("div");
      row.className = "tg-list-item";
      row.textContent = c._title;
      row.addEventListener("click", async () => {
        await performForwardTo(c.id);
        modal.classList.remove("visible");
      });
      body.appendChild(row);
    }
    modal.classList.add("visible");
  }

  async function performForwardTo(targetChatId) {
    const ids = state.forwardIds.length ? state.forwardIds : state.ctxMessageId ? [state.ctxMessageId] : [];
    for (const mid of ids) {
      const m = state.messages.find((x) => x.id === mid);
      state.socket.emit("send_message", {
        chatId: targetChatId,
        content: m?.content || "",
        file_url: m?.file_url,
        file_type: m?.file_type,
        forwardFrom: m
          ? { userId: m.sender_id, messageId: m.id }
          : undefined,
      });
    }
    state.forwardIds = [];
    state.forwardPickMode = false;
    updateForwardBar();
  }

  function openReactionModal(messageId) {
    state.reactionMessageId = messageId;
    const modal = $("modalReaction");
    const box = $("reactionChoices");
    box.innerHTML = "";
    for (const em of REACTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = em;
      b.addEventListener("click", () => {
        state.socket.emit("message_reaction", { messageId, emoji: em });
        modal.classList.remove("visible");
      });
      box.appendChild(b);
    }
    modal.classList.add("visible");
  }

  function pinMsg(messageId, pinned) {
    state.socket.emit("pin_message", {
      messageId,
      pinned,
      chatId: state.activeChatId,
    });
  }

  function delMsg(messageId, all) {
    state.socket.emit("delete_message", { messageId, forEveryone: all });
  }

  function buildEmojiPanels() {
    const ep = $("emojiPanel");
    const sp = $("stickerPanel");
    ep.innerHTML = "";
    sp.innerHTML = "";
    for (const em of EMOJI_PANEL) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = em;
      b.addEventListener("click", () => {
        const ta = $("composeInput");
        ta.value += em;
        ta.focus();
      });
      ep.appendChild(b);
    }
    for (const st of STICKERS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = st;
      b.addEventListener("click", () => {
        const ta = $("composeInput");
        ta.value += st;
        ta.focus();
      });
      sp.appendChild(b);
    }
  }

  function setupCallUi() {
    window.SondermCallUi = {
      showIncoming(payload) {
        $("callOverlay").classList.remove("tg-hidden");
        $("callAccept").classList.remove("tg-hidden");
        $("callReject").classList.remove("tg-hidden");
        $("callHangup").classList.add("tg-hidden");
        $("callLabel").textContent = `Входящий ${payload.type === "video" ? "видео" : "аудио"}звонок`;
        $("callSub").textContent =
          payload.caller?.display_name || payload.caller?.username || "Контакт";
        const vid = payload.type === "video";
        $("callRemoteVideo").style.display = vid ? "block" : "none";
        $("callLocalVideo").style.display = vid ? "block" : "none";
      },
      showOutgoing(type) {
        $("callOverlay").classList.remove("tg-hidden");
        $("callAccept").classList.add("tg-hidden");
        $("callReject").classList.add("tg-hidden");
        $("callHangup").classList.remove("tg-hidden");
        $("callLabel").textContent = "Вызов…";
        $("callSub").textContent = "Ожидаем ответ";
        const vid = type === "video";
        $("callRemoteVideo").style.display = vid ? "block" : "none";
        $("callLocalVideo").style.display = vid ? "block" : "none";
      },
      showActive(type) {
        $("callAccept").classList.add("tg-hidden");
        $("callReject").classList.add("tg-hidden");
        $("callHangup").classList.remove("tg-hidden");
        $("callLabel").textContent = "Разговор";
        $("callSub").textContent = "";
        const vid = type === "video";
        $("callRemoteVideo").style.display = vid ? "block" : "none";
        $("callLocalVideo").style.display = vid ? "block" : "none";
      },
      hideCallOverlay() {
        $("callOverlay").classList.add("tg-hidden");
        const t = $("callTimer");
        if (t) t.textContent = "00:00";
      },
    };
    $("callAccept").addEventListener("click", () => window.SondermWebRTC.acceptIncoming());
    $("callReject").addEventListener("click", () => window.SondermWebRTC.rejectIncoming());
    $("callHangup").addEventListener("click", () => window.SondermWebRTC.endCallLocal());
  }

  async function openChatInfoModal() {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    if (!chat || chat.type !== "group") return;
    $("chatInfoTitle").textContent = chat._title || "Группа";
    const sb = window.authClient.supabase;
    const { data: parts } = await sb.from("participants").select("user_id").eq("chat_id", chat.id);
    const box = $("chatInfoParticipants");
    box.innerHTML = "";
    for (const uid of (parts || []).map((p) => p.user_id)) {
      const p = await fetchProfile(uid);
      const row = document.createElement("div");
      row.className = "tg-list-item";
      row.textContent = p?.display_name || p?.username || uid.slice(0, 8);
      box.appendChild(row);
    }
    state.addMemberPick = new Set();
    $("addMemberSearch").value = "";
    $("addMemberResults").innerHTML = "";
    $("addMemberSearch").oninput = async () => {
      const raw = $("addMemberSearch").value.trim().replace(/^@/, "");
      if (!raw) {
        $("addMemberResults").innerHTML = "";
        return;
      }
      const { data, error } = await sb
        .from("profiles")
        .select("id, username, display_name")
        .ilike("username", `%${raw}%`)
        .neq("id", state.user.id)
        .limit(20);
      if (error) return;
      $("addMemberResults").innerHTML = "";
      for (const u of data || []) {
        const row = document.createElement("div");
        row.className = "tg-list-item";
        row.textContent = `${u.display_name || u.username} (@${u.username})`;
        row.addEventListener("click", () => {
          if (state.addMemberPick.has(u.id)) {
            state.addMemberPick.delete(u.id);
            row.style.outline = "";
          } else {
            state.addMemberPick.add(u.id);
            row.style.outline = "2px solid var(--tg-accent)";
          }
        });
        $("addMemberResults").appendChild(row);
      }
    };
    $("btnAddMembers").onclick = () => {
      const ids = [...state.addMemberPick];
      if (!ids.length) return;
      state.socket.emit("add_group_members", { chatId: chat.id, userIds: ids });
      $("modalChatInfo").classList.remove("visible");
    };
    $("modalChatInfo").classList.add("visible");
  }

  function setupUi() {
    $("chatSearch").addEventListener("input", () => renderChatList());

    $("btnBackChat").addEventListener("click", () => {
      state.activeChatId = null;
      if (isMobile()) setMobileLayout("list");
    });

    $("btnEmoji").addEventListener("click", () => {
      $("emojiPanel").classList.toggle("visible");
      $("stickerPanel").classList.remove("visible");
    });
    $("btnSticker").addEventListener("click", () => {
      $("stickerPanel").classList.toggle("visible");
      $("emojiPanel").classList.remove("visible");
    });

    $("btnAttach").addEventListener("click", () => $("fileInput").click());
    $("fileInput").addEventListener("change", onPickFile);

    $("btnVoice").addEventListener("click", toggleVoice);

    const ta = $("composeInput");
    ta.addEventListener("input", () => {
      $("btnSend").classList.toggle("tg-hidden", !ta.value.trim());
      emitTyping();
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !isMobile()) {
        e.preventDefault();
        sendCurrent();
      }
    });
    $("btnSend").addEventListener("click", sendCurrent);

    $("ctxBackdrop").addEventListener("click", closeCtx);

    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-close");
        if (id) $(id).classList.remove("visible");
      });
    });

    $("btnPinnedClose").addEventListener("click", () => {
      state.pinnedBarCollapsed = true;
      $("pinnedBar").classList.remove("visible");
    });

    function onTabClick(e) {
      const btn = e.target.closest("button[data-tab]");
      if (!btn) return;
      const tab = btn.getAttribute("data-tab");
      syncTabButtons(tab);
      showScreen(tab);
      if (tab === "contacts") loadContacts();
      if (isMobile()) setMobileLayout("list");
    }

    $("bottomNav").addEventListener("click", onTabClick);
    $("desktopNav")?.addEventListener("click", onTabClick);

    $("contactSearch")?.addEventListener("input", () => loadContacts());

    $("btnNewFolder").addEventListener("click", () => {
      state.selectedFolderIcon = "📁";
      buildFolderIconPicker($("folderIconPicker"), state.selectedFolderIcon, (ic) => {
        state.selectedFolderIcon = ic;
      });
      $("modalFolder").classList.add("visible");
    });
    $("btnFolderCreate").addEventListener("click", onCreateFolder);

    $("btnPickChatsSave").addEventListener("click", onSaveFolderChats);

    $("btnFolderSave").addEventListener("click", () => {
      const id = state.editingFolderId;
      if (!id) return;
      state.socket.emit("update_folder", {
        folderId: id,
        name: $("folderEditName").value.trim(),
        icon: state.folderEditIcon,
      });
      $("modalFolderEdit").classList.remove("visible");
    });
    $("btnFolderDelete").addEventListener("click", () => {
      const id = state.editingFolderId;
      if (!id) return;
      if (confirm("Удалить папку? Чаты из папки останутся в общем списке.")) {
        state.socket.emit("delete_folder", { folderId: id });
        $("modalFolderEdit").classList.remove("visible");
      }
    });

    $("btnCall").addEventListener("click", () => {
      const chat = state.chats.find((c) => c.id === state.activeChatId);
      if (!chat || chat.type !== "private" || isChatSaved(chat)) {
        alert("Звонок только в личном чате (не «Избранное»).");
        return;
      }
      $("modalCallType").classList.add("visible");
    });
    $("btnCallAudio").addEventListener("click", () => {
      $("modalCallType").classList.remove("visible");
      window.SondermWebRTC.startOutgoing(state.activeChatId, "audio");
    });
    $("btnCallVideo").addEventListener("click", () => {
      $("modalCallType").classList.remove("visible");
      window.SondermWebRTC.startOutgoing(state.activeChatId, "video");
    });

    $("btnChatMenu").addEventListener("click", () => {
      const chat = state.chats.find((c) => c.id === state.activeChatId);
      if (!chat) return;
      if (chat.type === "group") openChatInfoModal();
      else alert("В личном чате: закрепление чата — долгий тап по чату в списке.");
    });

    const chatPanel = $("chatPanel");
    let sx = 0;
    let sy = 0;
    chatPanel.addEventListener(
      "touchstart",
      (e) => {
        if (!isMobile() || !state.activeChatId) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true }
    );
    chatPanel.addEventListener(
      "touchend",
      (e) => {
        if (!isMobile() || !state.activeChatId) return;
        const x = e.changedTouches[0].clientX;
        const y = e.changedTouches[0].clientY;
        if (sx <= 24 && x - sx > 70 && Math.abs(y - sy) < 50) {
          state.activeChatId = null;
          setMobileLayout("list");
        }
      },
      { passive: true }
    );

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.activeChatId) {
        state.socket.emit("stop_typing", { chatId: state.activeChatId });
      }
    });
  }

  function emitTyping() {
    if (!state.activeChatId) return;
    state.socket.emit("typing", { chatId: state.activeChatId });
    clearTimeout(state.typingStopTimer);
    state.typingStopTimer = setTimeout(() => {
      state.socket.emit("stop_typing", { chatId: state.activeChatId });
    }, 1500);
  }

  function onCreateFolder() {
    const name = ($("folderNameInput").value || "").trim();
    if (!name) return;
    state.socket.emit("create_folder", {
      name,
      icon: state.selectedFolderIcon || "📁",
    });
    $("modalFolder").classList.remove("visible");
    $("folderNameInput").value = "";
  }

  function openPickChatsModal() {
    const modal = $("modalPickChats");
    const body = $("pickChatsBody");
    body.innerHTML = "";
    for (const c of state.chats) {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.gap = "10px";
      label.style.padding = "8px 0";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.chatId = c.id;
      label.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = c._title;
      label.appendChild(span);
      body.appendChild(label);
    }
    modal.classList.add("visible");
  }

  async function onSaveFolderChats() {
    const folderId = state._pickFolderId;
    if (!folderId) {
      $("modalPickChats").classList.remove("visible");
      return;
    }
    const checks = [...document.querySelectorAll("#pickChatsBody input[type=checkbox]")];
    const chosen = checks.filter((c) => c.checked).map((c) => c.dataset.chatId);
    const sb = window.authClient.supabase;
    const rows = chosen.map((chatId) => ({ folder_id: folderId, chat_id: chatId }));
    if (rows.length) {
      const { error } = await sb.from("folder_chats").insert(rows);
      if (error) alert(error.message);
    }
    state._pickFolderId = null;
    $("modalPickChats").classList.remove("visible");
    await loadFolders();
    renderFolderTabs();
    renderChatList();
  }

  async function loadContacts() {
    const sb = window.authClient.supabase;
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_online")
      .neq("id", state.user.id)
      .order("display_name", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    const host = $("contactList");
    host.innerHTML = "";
    const q = ($("contactSearch").value || "").toLowerCase();
    for (const p of data || []) {
      const name = (p.display_name || p.username || "").toLowerCase();
      if (q && !name.includes(q)) continue;
      const row = document.createElement("div");
      row.className = "tg-list-item";
      const av = document.createElement("div");
      av.className = "tg-avatar sm";
      av.textContent = initials(p.display_name || p.username);
      const t = document.createElement("div");
      t.style.flex = "1";
      t.innerHTML = `<strong>${escapeHtml(p.display_name || p.username)}</strong><div style="color:var(--tg-muted);font-size:13px">${p.is_online ? "в сети" : "не в сети"}</div>`;
      row.appendChild(av);
      row.appendChild(t);
      row.addEventListener("click", () => {
        state.socket.emit("open_private_chat", { targetUserId: p.id });
      });
      host.appendChild(row);
    }
  }

  function renderSettings() {
    const host = $("settingsList");
    host.innerHTML = "";
    const row = document.createElement("div");
    row.className = "tg-list-item";
    row.textContent = "Выйти из аккаунта";
    row.addEventListener("click", async () => {
      await window.authClient.signOut();
      window.location.href = "/login.html";
    });
    host.appendChild(row);

    const row2 = document.createElement("div");
    row2.className = "tg-list-item";
    row2.textContent = "Офлайн: кэш страницы (Service Worker)";
    host.appendChild(row2);
  }

  function renderProfileForm() {
    const host = $("profileForm");
    const p = state.profile || {};
    host.innerHTML = `
      <label style="display:block;margin:10px 0 4px;font-size:13px;color:var(--tg-muted)">Отображаемое имя</label>
      <input id="pfDisplay" type="text" value="${escapeHtml(p.display_name || "")}" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--tg-panel-2)" />
      <label style="display:block;margin:10px 0 4px;font-size:13px;color:var(--tg-muted)">Username</label>
      <input id="pfUser" type="text" value="${escapeHtml(p.username || "")}" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--tg-panel-2)" />
      <button type="button" id="pfSave" style="margin-top:12px;width:100%;padding:10px;border:none;border-radius:8px;background:var(--tg-accent);color:#fff;font-weight:700;cursor:pointer">Сохранить</button>
    `;
    $("pfSave").onclick = () => {
      state.socket.emit("profile:update", {
        display_name: $("pfDisplay").value.trim(),
        username: $("pfUser").value.trim(),
      });
    };
  }

  function sendCurrent() {
    const text = ($("composeInput").value || "").trim();
    const chatId = state.activeChatId;
    if (!chatId || !text) return;
    state.socket.emit("send_message", {
      chatId,
      content: text,
      replyTo: state.replyTo?.id || null,
    });
    $("composeInput").value = "";
    $("btnSend").classList.add("tg-hidden");
    state.replyTo = null;
    updateReplyBar();
    state.socket.emit("stop_typing", { chatId });
  }

  function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !state.activeChatId) return;
    if (f.size > 4 * 1024 * 1024) {
      alert("Файл больше 4 МБ — упростите или подключите Supabase Storage.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.socket.emit("send_message", {
        chatId: state.activeChatId,
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
        state.audioChunks = [];
        state.mediaRecorder = new MediaRecorder(stream);
        state.mediaRecorder.ondataavailable = (ev) => state.audioChunks.push(ev.data);
        state.mediaRecorder.onstop = () => {
          const blob = new Blob(state.audioChunks, { type: "audio/webm" });
          const r = new FileReader();
          r.onload = () => {
            state.socket.emit("send_message", {
              chatId: state.activeChatId,
              content: "Голосовое сообщение",
              file_url: r.result,
              file_type: "audio/webm",
            });
          };
          r.readAsDataURL(blob);
          stream.getTracks().forEach((t) => t.stop());
        };
        state.mediaRecorder.start();
        state.recording = true;
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

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
