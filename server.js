const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { supabase } = require("./supabase");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

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

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        username,
      },
      { onConflict: "id" }
    )
    .select("id, email, username")
    .single();

  if (error) throw error;
  return data;
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
  console.log(
    `Socket connected: ${socket.id}, user=${socket.user.id}, username=${socket.profile.username}`
  );

  socket.emit("auth:ready", {
    user: {
      id: socket.user.id,
      email: socket.user.email,
    },
    profile: socket.profile,
  });

  socket.on("profile:update", async (payload = {}) => {
    const username = String(payload.username || "").trim();
    if (!username) {
      socket.emit("profile:error", { message: "username обязателен" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", socket.user.id)
        .select("id, email, username")
        .single();

      if (error) throw error;

      socket.profile = data;
      socket.emit("profile:updated", data);
    } catch (err) {
      socket.emit("profile:error", { message: err.message });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}, user=${socket.user?.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
