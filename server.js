const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { supabase } = require("./supabase");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

/** Публичный anon + URL для браузера (без service_role) */
app.get("/auth-config.js", (_req, res) => {
  res.type("application/javascript; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.send(
    `window.SONDERM_CONFIG=${JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    })};`
  );
});

app.use(express.json({ limit: "25mb" }));
app.use(express.static(__dirname));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

/** Активные WebRTC-звонки */
const activeCalls = new Map();

/** userId -> количество активных сокетов */
const onlineCounts = new Map();

async function verifySupabaseToken(accessToken) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) throw new Error(error.message);
  if (!data?.user) throw new Error("Пользователь не найден");
  return data.user;
}

async function upsertProfileFromAuthUser(user) {
  const username =
    user.user_metadata?.username ||
    (user.email ? user.email.split("@")[0] : `user_${user.id.slice(0, 8)}`);
  const displayName =
    user.user_metadata?.display_name || user.user_metadata?.full_name || username;

  const row = {
    id: user.id,
    username,
    display_name: displayName,
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select("id, username, display_name, avatar_url, is_online, last_seen")
    .single();

  if (error) throw error;
  return data;
}

async function assertParticipant(chatId, userId) {
  const { data, error } = await supabase
    .from("participants")
    .select("chat_id")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const err = new Error("Нет доступа к этому чату");
    err.code = "FORBIDDEN";
    throw err;
  }
}

async function getMessageChatId(messageId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, chat_id, sender_id")
    .eq("id", messageId)
    .single();

  if (error) throw error;
  return data;
}

async function fetchSenderProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_online, last_seen")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function aggregateReactions(messageId) {
  const { data, error } = await supabase
    .from("message_reactions")
    .select("emoji, user_id")
    .eq("message_id", messageId);

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const key = row.emoji;
    if (!map.has(key)) map.set(key, { emoji: key, count: 0, userIds: [] });
    const bucket = map.get(key);
    bucket.count += 1;
    bucket.userIds.push(row.user_id);
  }

  return Array.from(map.values()).map((b) => ({
    emoji: b.emoji,
    count: b.count,
    userIds: b.userIds,
  }));
}

async function getPinnedChatIdsForUser(userId) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return [];
    const pins = data.user.user_metadata?.pinned_chat_ids;
    return Array.isArray(pins) ? pins.filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

async function setPinnedChatIdsForUser(userId, chatIds) {
  const next = chatIds.filter(Boolean).slice(0, 3);
  const { data: cur, error: e1 } = await supabase.auth.admin.getUserById(userId);
  if (e1 || !cur?.user) throw new Error(e1?.message || "admin.getUserById failed");
  const meta = { ...(cur.user.user_metadata || {}), pinned_chat_ids: next };
  const { error: e2 } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: meta,
  });
  if (e2) throw e2;
  return next;
}

async function getOtherPrivateParticipantId(chatId, userId) {
  const { data: rows, error } = await supabase
    .from("participants")
    .select("user_id")
    .eq("chat_id", chatId);
  if (error) return null;
  const ids = (rows || []).map((r) => r.user_id);
  if (ids.length !== 2) return null;
  const other = ids.find((id) => id !== userId);
  return other || null;
}

async function isSavedMessagesChatRow(chat) {
  if (!chat) return false;
  if (chat.description === "sonderm_saved") return true;
  if (chat.name !== "Избранное") return false;
  const { count, error } = await supabase
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("chat_id", chat.id);
  if (error) return false;
  return count === 1;
}

async function ensureSavedChatForUser(userId, socket) {
  try {
    const { data: myRows, error: e1 } = await supabase
      .from("participants")
      .select("chat_id")
      .eq("user_id", userId);

    if (e1) throw e1;

    for (const row of myRows || []) {
      const chatId = row.chat_id;
      const { count, error: e2 } = await supabase
        .from("participants")
        .select("*", { count: "exact", head: true })
        .eq("chat_id", chatId);

      if (e2) throw e2;
      if (count !== 1) continue;

      const { data: chat, error: e3 } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

      if (!e3 && chat && chat.type === "private" && (await isSavedMessagesChatRow(chat))) {
        socket.emit("saved_chat_ready", { chat });
        return;
      }
    }

    const { data: chat, error: e4 } = await supabase
      .from("chats")
      .insert({
        type: "private",
        name: "Избранное",
        description: "sonderm_saved",
        created_by: userId,
      })
      .select("*")
      .single();

    if (e4) throw e4;

    const { error: e5 } = await supabase.from("participants").insert({
      chat_id: chat.id,
      user_id: userId,
      role: "owner",
    });

    if (e5) throw e5;

    socket.emit("saved_chat_ready", { chat });
  } catch (e) {
    socket.emit("app:error", { message: e.message });
  }
}

async function assertFolderOwner(folderId, userId) {
  const { data, error } = await supabase
    .from("chat_folders")
    .select("id, user_id")
    .eq("id", folderId)
    .single();
  if (error) throw error;
  if (!data || data.user_id !== userId) {
    const err = new Error("Папка не найдена");
    err.code = "FORBIDDEN";
    throw err;
  }
}

function bumpOnline(userId) {
  const n = (onlineCounts.get(userId) || 0) + 1;
  onlineCounts.set(userId, n);
  return n;
}

function dropOnline(userId) {
  const n = (onlineCounts.get(userId) || 1) - 1;
  if (n <= 0) onlineCounts.delete(userId);
  else onlineCounts.set(userId, n);
  return Math.max(0, n);
}

async function setProfileOnline(userId, isOnline) {
  const patch = {
    is_online: isOnline,
    last_seen: new Date().toISOString(),
  };
  await supabase.from("profiles").update(patch).eq("id", userId);
}

io.use(async (socket, next) => {
  try {
    const tokenFromAuth = socket.handshake.auth?.accessToken;
    const header = socket.handshake.headers.authorization || "";
    const tokenFromHeader = header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : null;
    const accessToken = tokenFromAuth || tokenFromHeader;

    if (!accessToken) {
      return next(new Error("UNAUTHORIZED: token required"));
    }

    const user = await verifySupabaseToken(accessToken);
    const profile = await upsertProfileFromAuthUser(user);
    socket.user = user;
    socket.profile = profile;
    return next();
  } catch (error) {
    return next(new Error(`UNAUTHORIZED: ${error.message}`));
  }
});

io.on("connection", (socket) => {
  const userId = socket.user.id;

  socket.join(`user:${userId}`);

  const afterConnect = bumpOnline(userId);
  if (afterConnect === 1) {
    setProfileOnline(userId, true).catch(() => {});
    socket.broadcast.emit("user_status", {
      userId,
      status: "online",
      username: socket.profile.username,
    });
  }

  socket.emit("auth:ready", {
    user: { id: socket.user.id, email: socket.user.email },
    profile: socket.profile,
  });

  void ensureSavedChatForUser(userId, socket);
  void (async () => {
    const pins = await getPinnedChatIdsForUser(userId);
    socket.emit("pinned_chats", { chatIds: pins });
  })();

  socket.on("user_online", async () => {
    try {
      await setProfileOnline(userId, true);
      socket.broadcast.emit("user_status", {
        userId,
        status: "online",
        username: socket.profile.username,
      });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("join_chat", async (payload = {}) => {
    const chatId = payload.chatId;
    if (!chatId) return;
    try {
      await assertParticipant(chatId, userId);
      socket.join(`chat:${chatId}`);
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("ensure_saved_chat", async () => {
    await ensureSavedChatForUser(userId, socket);
  });

  socket.on("open_private_chat", async (payload = {}) => {
    const targetUserId = payload.targetUserId;
    if (!targetUserId || targetUserId === userId) return;

    try {
      const { data: mine, error: e1 } = await supabase
        .from("participants")
        .select("chat_id")
        .eq("user_id", userId);

      if (e1) throw e1;

      const { data: theirs, error: e2 } = await supabase
        .from("participants")
        .select("chat_id")
        .eq("user_id", targetUserId);

      if (e2) throw e2;

      const setMine = new Set((mine || []).map((r) => r.chat_id));
      const common = (theirs || [])
        .map((r) => r.chat_id)
        .filter((id) => setMine.has(id));

      for (const chatId of common) {
        const { count, error: e3 } = await supabase
          .from("participants")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chatId);

        if (e3) throw e3;
        if (count !== 2) continue;

        const { data: chat, error: e4 } = await supabase
          .from("chats")
          .select("*")
          .eq("id", chatId)
          .single();

        if (!e4 && chat && chat.type === "private") {
          if (await isSavedMessagesChatRow(chat)) continue;
          socket.emit("private_chat_ready", { chat, peerId: targetUserId });
          return;
        }
      }

      const { data: chat, error: e5 } = await supabase
        .from("chats")
        .insert({
          type: "private",
          created_by: userId,
        })
        .select("*")
        .single();

      if (e5) throw e5;

      const { error: e6 } = await supabase.from("participants").insert([
        { chat_id: chat.id, user_id: userId, role: "member" },
        { chat_id: chat.id, user_id: targetUserId, role: "member" },
      ]);

      if (e6) throw e6;

      socket.emit("private_chat_ready", { chat, peerId: targetUserId });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("leave_chat", (payload = {}) => {
    const chatId = payload.chatId;
    if (!chatId) return;
    socket.leave(`chat:${chatId}`);
  });

  socket.on("send_message", async (payload = {}) => {
    const chatId = payload.chatId;
    const content = String(payload.content ?? "").trim();
    const fileUrl = payload.file_url ? String(payload.file_url) : null;
    const fileType = payload.file_type ? String(payload.file_type) : null;
    const replyTo = payload.replyTo || null;
    const forwardFrom = payload.forwardFrom || null;

    if (!chatId) return;
    if (!content && !fileUrl) return;

    try {
      await assertParticipant(chatId, userId);

      const insert = {
        chat_id: chatId,
        sender_id: userId,
        content: content || (fileUrl ? "" : ""),
        file_url: fileUrl,
        file_type: fileType,
        reply_to_message_id: replyTo || null,
        forwarded_from_user_id: forwardFrom?.userId || null,
        forwarded_from_message_id: forwardFrom?.messageId || null,
      };

      const { data: msg, error } = await supabase
        .from("messages")
        .insert(insert)
        .select("*")
        .single();

      if (error) throw error;

      await supabase
        .from("chats")
        .update({ last_message_at: msg.created_at })
        .eq("id", chatId);

      const sender = await fetchSenderProfile(userId);

      io.to(`chat:${chatId}`).emit("new_message", {
        message: msg,
        sender,
      });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("typing", async (payload = {}) => {
    const chatId = payload.chatId;
    if (!chatId) return;
    try {
      await assertParticipant(chatId, userId);
      socket.to(`chat:${chatId}`).emit("user_typing", {
        userId,
        username: socket.profile.username,
        displayName: socket.profile.display_name,
        chatId,
      });
    } catch {
      /* ignore */
    }
  });

  socket.on("stop_typing", async (payload = {}) => {
    const chatId = payload.chatId;
    if (!chatId) return;
    try {
      await assertParticipant(chatId, userId);
      socket.to(`chat:${chatId}`).emit("user_stopped_typing", {
        userId,
        chatId,
      });
    } catch {
      /* ignore */
    }
  });

  socket.on("message_reaction", async (payload = {}) => {
    const messageId = payload.messageId;
    const emoji = String(payload.emoji || "").trim();
    if (!messageId || !emoji) return;

    try {
      const msg = await getMessageChatId(messageId);
      await assertParticipant(msg.chat_id, userId);

      const { data: existing } = await supabase
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("message_reactions").delete().eq("id", existing.id);
      } else {
        await supabase.from("message_reactions").insert({
          message_id: messageId,
          user_id: userId,
          emoji,
        });
      }

      const reactions = await aggregateReactions(messageId);
      io.to(`chat:${msg.chat_id}`).emit("reaction_updated", {
        messageId,
        reactions,
      });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("delete_message", async (payload = {}) => {
    const messageId = payload.messageId;
    const forEveryone = !!payload.forEveryone;
    if (!messageId) return;

    try {
      const msg = await getMessageChatId(messageId);
      await assertParticipant(msg.chat_id, userId);

      if (forEveryone) {
        if (msg.sender_id !== userId) {
          socket.emit("app:error", { message: "Удалить для всех может только автор" });
          return;
        }
        await supabase
          .from("messages")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            content: "",
            file_url: null,
            file_type: null,
          })
          .eq("id", messageId);

        io.to(`chat:${msg.chat_id}`).emit("message_deleted", {
          messageId,
          chatId: msg.chat_id,
          forEveryone: true,
        });
      } else {
        socket.emit("message_deleted", {
          messageId,
          chatId: msg.chat_id,
          forEveryone: false,
        });
      }
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("pin_message", async (payload = {}) => {
    const messageId = payload.messageId;
    const chatIdPayload = payload.chatId;
    const pinned = payload.pinned !== false;
    if (!messageId) return;

    try {
      const msg = await getMessageChatId(messageId);
      if (chatIdPayload && chatIdPayload !== msg.chat_id) {
        socket.emit("app:error", { message: "Неверный чат для сообщения" });
        return;
      }
      await assertParticipant(msg.chat_id, userId);

      await supabase.from("messages").update({ is_pinned: pinned }).eq("id", messageId);

      io.to(`chat:${msg.chat_id}`).emit("message_pinned", {
        messageId,
        chatId: msg.chat_id,
        pinned,
      });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("message_ack_delivered", async (payload = {}) => {
    const messageId = payload.messageId;
    const chatId = payload.chatId;
    if (!messageId || !chatId) return;
    try {
      const msg = await getMessageChatId(messageId);
      if (msg.chat_id !== chatId) return;
      await assertParticipant(chatId, userId);
      if (msg.sender_id === userId) return;
      io.to(`user:${msg.sender_id}`).emit("message_delivery_update", {
        messageId,
        chatId,
        byUserId: userId,
      });
    } catch {
      /* ignore */
    }
  });

  socket.on("pin_chat", async (payload = {}) => {
    const chatId = payload.chatId;
    if (!chatId) return;
    try {
      await assertParticipant(chatId, userId);
      let pins = await getPinnedChatIdsForUser(userId);
      if (pins.includes(chatId)) return;
      if (pins.length >= 3) {
        socket.emit("app:error", { message: "Максимум 3 закреплённых чата" });
        return;
      }
      pins = [chatId, ...pins.filter((id) => id !== chatId)].slice(0, 3);
      const next = await setPinnedChatIdsForUser(userId, pins);
      io.to(`user:${userId}`).emit("chat_pinned", { chatIds: next });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("unpin_chat", async (payload = {}) => {
    const chatId = payload.chatId;
    if (!chatId) return;
    try {
      let pins = (await getPinnedChatIdsForUser(userId)).filter((id) => id !== chatId);
      const next = await setPinnedChatIdsForUser(userId, pins);
      io.to(`user:${userId}`).emit("chat_pinned", { chatIds: next });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("create_folder", async (payload = {}) => {
    const name = String(payload.name || "").trim();
    const icon = String(payload.icon || "📁").trim() || "📁";
    if (!name) return;
    try {
      const { data, error } = await supabase
        .from("chat_folders")
        .insert({
          user_id: userId,
          name,
          icon,
          sort_order: Date.now(),
        })
        .select("*")
        .single();
      if (error) throw error;
      socket.emit("folder_created", { folder: data });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("update_folder", async (payload = {}) => {
    const folderId = payload.folderId;
    if (!folderId) return;
    try {
      await assertFolderOwner(folderId, userId);
      const patch = {};
      if (payload.name != null) patch.name = String(payload.name).trim();
      if (payload.icon != null) patch.icon = String(payload.icon).trim();
      const { data, error } = await supabase
        .from("chat_folders")
        .update(patch)
        .eq("id", folderId)
        .select("*")
        .single();
      if (error) throw error;
      socket.emit("folder_updated", { folder: data });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("delete_folder", async (payload = {}) => {
    const folderId = payload.folderId;
    if (!folderId) return;
    try {
      await assertFolderOwner(folderId, userId);
      await supabase.from("folder_chats").delete().eq("folder_id", folderId);
      await supabase.from("chat_folders").delete().eq("id", folderId);
      socket.emit("folder_deleted", { folderId });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("add_chat_to_folder", async (payload = {}) => {
    const folderId = payload.folderId;
    const chatId = payload.chatId;
    if (!folderId || !chatId) return;
    try {
      await assertFolderOwner(folderId, userId);
      await assertParticipant(chatId, userId);
      const { error } = await supabase.from("folder_chats").insert({ folder_id: folderId, chat_id: chatId });
      if (error && error.code !== "23505") throw error;
      socket.emit("folder_chat_added", { folderId, chatId });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("remove_chat_from_folder", async (payload = {}) => {
    const folderId = payload.folderId;
    const chatId = payload.chatId;
    if (!folderId || !chatId) return;
    try {
      await assertFolderOwner(folderId, userId);
      await supabase.from("folder_chats").delete().eq("folder_id", folderId).eq("chat_id", chatId);
      socket.emit("folder_chat_removed", { folderId, chatId });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("add_group_members", async (payload = {}) => {
    const chatId = payload.chatId;
    const userIds = Array.isArray(payload.userIds) ? payload.userIds : [];
    if (!chatId || userIds.length === 0) return;
    try {
      await assertParticipant(chatId, userId);
      const { data: chat, error: e1 } = await supabase.from("chats").select("*").eq("id", chatId).single();
      if (e1) throw e1;
      if (chat.type !== "group") {
        socket.emit("app:error", { message: "Только для групповых чатов" });
        return;
      }
      if (await isSavedMessagesChatRow(chat)) {
        socket.emit("app:error", { message: "В «Избранное» нельзя добавлять участников" });
        return;
      }
      for (const uid of userIds) {
        const { error: e2 } = await supabase.from("participants").insert({
          chat_id: chatId,
          user_id: uid,
          role: "member",
        });
        if (e2 && e2.code !== "23505") throw e2;
      }
      io.to(`chat:${chatId}`).emit("participants_updated", { chatId });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("call_invite", async (payload = {}) => {
    const chatId = payload.chatId;
    const type = payload.type === "video" ? "video" : "audio";
    const sdpOffer = payload.sdpOffer;
    if (!chatId || !sdpOffer) return;
    try {
      await assertParticipant(chatId, userId);
      const calleeId = await getOtherPrivateParticipantId(chatId, userId);
      if (!calleeId) {
        socket.emit("app:error", { message: "Звонок доступен только в личном чате (1:1)" });
        return;
      }
      const callId = payload.callId || crypto.randomUUID();
      activeCalls.set(callId, { callerId: userId, calleeId, chatId, type });
      io.to(`user:${calleeId}`).emit("call_incoming", {
        callId,
        chatId,
        type,
        sdpOffer,
        caller: socket.profile,
      });
    } catch (e) {
      socket.emit("app:error", { message: e.message });
    }
  });

  socket.on("call_answer", async (payload = {}) => {
    const callId = payload.callId;
    const sdpAnswer = payload.sdpAnswer;
    if (!callId || !sdpAnswer) return;
    const c = activeCalls.get(callId);
    if (!c || c.calleeId !== userId) return;
    io.to(`user:${c.callerId}`).emit("call_answer_remote", {
      callId,
      sdpAnswer,
      type: c.type,
    });
  });

  socket.on("call_reject", (payload = {}) => {
    const callId = payload.callId;
    if (!callId) return;
    const c = activeCalls.get(callId);
    if (!c) return;
    activeCalls.delete(callId);
    io.to(`user:${c.callerId}`).emit("call_rejected", { callId });
  });

  socket.on("call_ice", (payload = {}) => {
    const callId = payload.callId;
    const candidate = payload.candidate;
    if (!callId || !candidate) return;
    const c = activeCalls.get(callId);
    if (!c) return;
    const target = userId === c.callerId ? c.calleeId : c.callerId;
    io.to(`user:${target}`).emit("call_ice_remote", { callId, candidate });
  });

  socket.on("call_end", (payload = {}) => {
    const callId = payload.callId;
    if (!callId) return;
    const c = activeCalls.get(callId);
    if (!c) return;
    activeCalls.delete(callId);
    io.to(`user:${c.callerId}`).emit("call_ended", { callId });
    io.to(`user:${c.calleeId}`).emit("call_ended", { callId });
  });

  socket.on("mark_messages_read", async (payload = {}) => {
    const chatId = payload.chatId;
    const messageIds = Array.isArray(payload.messageIds) ? payload.messageIds : [];
    if (!chatId || messageIds.length === 0) return;

    try {
      await assertParticipant(chatId, userId);
      const readAt = new Date().toISOString();
      for (const mid of messageIds) {
        const { error } = await supabase.from("message_reads").insert({
          message_id: mid,
          user_id: userId,
          read_at: readAt,
        });
        if (error && error.code !== "23505") {
          /* 23505 = duplicate key — уже прочитано */
        }
      }
    } catch {
      /* ignore */
    }
  });

  socket.on("profile:update", async (payload = {}) => {
    const username = payload.username != null ? String(payload.username).trim() : null;
    const displayName =
      payload.display_name != null ? String(payload.display_name).trim() : null;

    if (!username && !displayName) {
      socket.emit("profile:error", { message: "Нечего обновлять" });
      return;
    }

    try {
      const patch = {};
      if (username) patch.username = username;
      if (displayName) patch.display_name = displayName;

      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("id, username, display_name, avatar_url, is_online, last_seen")
        .single();

      if (error) throw error;
      socket.profile = data;
      socket.emit("profile:updated", data);
    } catch (err) {
      socket.emit("profile:error", { message: err.message });
    }
  });

  socket.on("disconnect", () => {
    for (const [cid, c] of [...activeCalls.entries()]) {
      if (c.callerId === userId || c.calleeId === userId) {
        activeCalls.delete(cid);
        io.to(`user:${c.callerId}`).emit("call_ended", { callId: cid });
        io.to(`user:${c.calleeId}`).emit("call_ended", { callId: cid });
      }
    }
    const left = dropOnline(userId);
    if (left === 0) {
      setProfileOnline(userId, false).catch(() => {});
      socket.broadcast.emit("user_status", {
        userId,
        status: "offline",
        username: socket.profile?.username,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
