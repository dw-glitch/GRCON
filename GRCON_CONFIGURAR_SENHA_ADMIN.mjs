/**
 * Uso administrativo local. NUNCA publique este arquivo com uma service_role preenchida.
 * Node.js 18+.
 *
 * Variáveis obrigatórias:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GRCON_USER_ID
 *   GRCON_INITIAL_PASSWORD
 */
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GRCON_USER_ID", "GRCON_INITIAL_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Variáveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const password = process.env.GRCON_INITIAL_PASSWORD;
if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  console.error("A senha deve ter pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo.");
  process.exit(1);
}

const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(process.env.GRCON_USER_ID)}`;
const response = await fetch(url, {
  method: "PUT",
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ password, email_confirm: true }),
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error("Falha ao definir senha:", body?.msg || body?.message || response.statusText);
  process.exit(1);
}
console.log(`Senha definida com segurança para ${body.email || process.env.GRCON_USER_ID}.`);
