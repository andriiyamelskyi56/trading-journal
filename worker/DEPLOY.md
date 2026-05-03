# Desplegar Schwab Proxy en Cloudflare Workers

## Pasos

### 1. Crear cuenta en Cloudflare (si no tienes)
Ve a https://dash.cloudflare.com/sign-up (gratis)

### 2. Instalar Wrangler
```bash
cd worker/
npm install
```

### 3. Login en Cloudflare
```bash
npx wrangler login
```
Se abrirá el navegador para autorizar.

### 4. Crear KV Namespace
```bash
npx wrangler kv:namespace create TOKENS
```
Copia el `id` que aparece y pégalo en `wrangler.toml` en la línea `id = ""`.

### 5. Configurar secrets (credenciales Schwab)
```bash
npx wrangler secret put SCHWAB_CLIENT_ID
# Pega: 2L0gGnR5IF1tyv0U4s0MPNuNVTGIW3LyR1KcfyidFt2cGKCf

npx wrangler secret put SCHWAB_CLIENT_SECRET
# Pega: RUc1pOwtCMKGDRAGQWDAE14UEiWI5fnWSTSiSNlVyJkICMEfK3aWMMzJgcqdcP9W

npx wrangler secret put WORKER_URL
# Pega: https://schwab-proxy.<tu-subdominio>.workers.dev
```

### 6. Desplegar
```bash
npx wrangler deploy
```

Te dará la URL del Worker (ej: `https://schwab-proxy.xxx.workers.dev`).

### 7. Actualizar Callback URL en Schwab
Ve al Developer Portal de Schwab y actualiza la Callback URL a:
`https://schwab-proxy.<tu-subdominio>.workers.dev/callback`

### 8. Probar
- Abre `https://schwab-proxy.xxx.workers.dev/status` → debería decir `{"connected":false}`
- Abre `https://schwab-proxy.xxx.workers.dev/login` → te redirige a Schwab para autorizar
