require('dotenv').config();

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

console.log("SUPABASE_URL:", supabaseUrl ? "загружен" : "НЕ ЗАГРУЖЕН");
console.log("SUPABASE_ANON_KEY:", supabaseAnonKey ? "загружен" : "НЕ ЗАГРУЖЕН");

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "SUPABASE_URL или SUPABASE_ANON_KEY не заданы. История сообщений из БД работать не будет."
  );
}

const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

module.exports = { supabase };