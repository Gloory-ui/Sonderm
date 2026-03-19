const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { supabase } = require("./supabase");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// socket.id -> имя пользователя
const users = new Map();

// Отдаём страницу чата
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

function buildOnlineUsers() {
  return Array.from(users.entries()).map(([id, name]) => ({
    id,
    name,
  }));
}

function emitOnlineUsers() {
  io.emit("users online", buildOnlineUsers());
}

async function upsertUser(username) {
  const { data, error } = await supabase
    .from("users")
    .upsert({ username }, { onConflict: "username" })
    .select("id, username")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function saveMessageToDb(username, text) {
  const user = await upsertUser(username);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      text,
    })
    .select("id, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function loadRecentMessages(limit = 50) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, text, created_at, users(username)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  // Возвращаем в хронологическом порядке (старые -> новые)
  return (data || [])
    .reverse()
    .map((row) => ({
      name: row.users?.username || "Без имени",
      text: row.text,
      time: row.created_at,
    }));
}

io.on("connection", (socket) => {
  console.log("Пользователь подключился:", socket.id);

  // Сразу считаем как "Без имени", пока пользователь не введёт имя
  users.set(socket.id, "Без имени");
  emitOnlineUsers();

  socket.on("set username", (name) => {
    const cleanName = String(name || "").trim();
    const finalName = cleanName || "Без имени";
    users.set(socket.id, finalName);

    emitOnlineUsers();

    // Пытаемся сохранить/обновить пользователя в БД
    upsertUser(finalName).catch((err) => {
      console.error("Ошибка upsert users:", err.message);
    });

    // Можем показать системное сообщение всем
    io.emit("chat system", {
      text: `${finalName} подключился`,
      time: new Date().toISOString(),
    });
  });

  socket.on("chat message", async (data) => {
    const name = users.get(socket.id) || "Без имени";
    const text = String(data?.text || "").trim();
    if (!text) return;

    let time = new Date().toISOString();
    try {
      const saved = await saveMessageToDb(name, text);
      time = saved.created_at;
    } catch (err) {
      // Если БД недоступна, чат всё равно работает в реальном времени
      console.error("Ошибка сохранения сообщения:", err.message);
    }

    io.emit("chat message", {
      name,
      text,
      time,
    });
  });

  socket.on("load history", async () => {
    try {
      const messages = await loadRecentMessages(50);
      socket.emit("chat history", messages);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err.message);
      socket.emit("chat history", []);
    }
  });

  socket.on("disconnect", () => {
    const name = users.get(socket.id);
    if (name) {
      io.emit("chat system", {
        text: `${name} отключился`,
        time: new Date().toISOString(),
      });
    }
    users.delete(socket.id);
    console.log("Пользователь отключился:", socket.id);

    emitOnlineUsers();
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
