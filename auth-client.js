(() => {
  const config = window.SONDERM_CONFIG || {};
  const supabaseUrl = config.supabaseUrl;
  const supabaseAnonKey = config.supabaseAnonKey;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "SONDERM_CONFIG не задан: нужны supabaseUrl и supabaseAnonKey (встроены в login/index или /auth-config.js)."
    );
  }

  const supabase = window.supabase.createClient(supabaseUrl || "", supabaseAnonKey || "");

  function syntheticEmailFromUsername(username) {
    const u = String(username || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    return `${u}@sonderm.app`;
  }

  /**
   * Регистрация: email опционален; если нет — логин через username@sonderm.app
   */
  async function signUp({ password, username, displayName, recoveryEmail }) {
    const u = String(username || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    const emailRaw = String(recoveryEmail || "").trim();
    const authEmail = emailRaw ? emailRaw.toLowerCase() : syntheticEmailFromUsername(u);
    return supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: {
          username: u,
          display_name: String(displayName || "").trim() || u,
        },
        emailRedirectTo: `${window.location.origin}/index.html`,
      },
    });
  }

  /**
   * Вход: email или username (username → запрос на сервер за реальным email в auth)
   */
  async function signIn(identifier, password) {
    let email = String(identifier || "").trim();
    if (!email) {
      return { data: null, error: new Error("Введите логин или email") };
    }
    if (!email.includes("@")) {
      try {
        const r = await fetch(`${window.location.origin}/api/auth/resolve-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: email.replace(/^@/, "") }),
        });
        const j = await r.json();
        if (!j.email) {
          return { data: null, error: new Error("Пользователь не найден") };
        }
        email = j.email;
      } catch (e) {
        return {
          data: null,
          error: new Error(
            e.message?.includes("fetch") || e.name === "TypeError"
              ? "Нет связи с сервером. Запустите приложение через тот же сайт (например Render) или проверьте сеть."
              : e.message
          ),
        };
      }
    }
    return supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
  }

  async function signOut() {
    return supabase.auth.signOut();
  }

  async function getSession() {
    return supabase.auth.getSession();
  }

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function connectAuthenticatedSocket(ioFactory) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Нет access token. Сначала войдите.");
    }
    return ioFactory({
      auth: {
        accessToken: token,
      },
    });
  }

  window.authClient = {
    supabase,
    signUp,
    signIn,
    signOut,
    getSession,
    getAccessToken,
    connectAuthenticatedSocket,
    syntheticEmailFromUsername,
  };
})();
