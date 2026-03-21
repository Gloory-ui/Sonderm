(() => {
  const config = window.SONDERM_CONFIG || {};
  const supabaseUrl = config.supabaseUrl;
  const supabaseAnonKey = config.supabaseAnonKey;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "SONDERM_CONFIG не задан. Создайте window.SONDERM_CONFIG с supabaseUrl и supabaseAnonKey."
    );
  }

  const supabase = window.supabase.createClient(supabaseUrl || "", supabaseAnonKey || "");

  async function signUp(email, password, username) {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
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
  };
})();
