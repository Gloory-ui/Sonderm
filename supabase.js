require('dotenv').config();

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serverKey = supabaseServiceRoleKey || supabaseAnonKey;

console.log("SUPABASE_URL:", supabaseUrl ? "загружен" : "НЕ ЗАГРУЖЕН");
console.log("SUPABASE_ANON_KEY:", supabaseAnonKey ? "загружен" : "НЕ ЗАГРУЖЕН");
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  supabaseServiceRoleKey ? "загружен" : "НЕ ЗАГРУЖЕН"
);

if (!supabaseUrl || !serverKey) {
  console.warn(
    "SUPABASE_URL и ключ Supabase не заданы. Сервер не сможет работать с Supabase."
  );
}

if (!supabaseServiceRoleKey) {
  console.warn(
    "Используется ANON ключ на сервере. Рекомендуется SUPABASE_SERVICE_ROLE_KEY для backend."
  );
}

const supabase = createClient(supabaseUrl || "", serverKey || "");

module.exports = { supabase };