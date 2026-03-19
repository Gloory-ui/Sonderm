const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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

    // Можем показать системное сообщение всем
    io.emit("chat system", {
      text: `${finalName} подключился`,
      time: new Date().toISOString(),
    });
  });

  socket.on("chat message", (data) => {
    const name = users.get(socket.id) || "Без имени";
    const text = String(data?.text || "").trim();
    if (!text) return;

    io.emit("chat message", {
      name,
      text,
      time: new Date().toISOString(),
    });
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
