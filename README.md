# Panel de Proyectos — Multivista (Jira)

Dashboard estático que muestra un resumen diario de todos los proyectos de Jira
a los que tiene acceso la cuenta configurada. Se actualiza solo, una vez por
día, vía GitHub Actions, y se publica gratis con GitHub Pages.

No hay backend: los datos se generan como un archivo `data/data.json` que la
página lee directamente. El acceso está protegido con un passcode simple
(no es seguridad real, ver sección "Sobre el passcode" más abajo).

## Qué vas a necesitar

- Una cuenta de GitHub (gratis)
- El token de API de Jira que ya generaste en id.atlassian.com
- Tu email de Atlassian: `mfranchini@voyansi.com`
- Tu dominio de Jira: `multivista.atlassian.net`

## Paso 1 — Crear el repositorio

1. Entrá a [github.com/new](https://github.com/new)
2. Nombre del repo: por ejemplo `jira-dashboard`
3. Elegí **Public** (GitHub Pages gratis requiere que el repo sea público —
   el passcode es lo que filtra el acceso, no la privacidad del repo)
4. No marques ninguna opción de inicialización (README, .gitignore, etc.) —
   ya los tenemos armados
5. Creá el repo

## Paso 2 — Subir estos archivos

Desde tu computadora, en la carpeta que descargaste:

```bash
cd jira-dashboard
git init
git add .
git commit -m "Panel de proyectos inicial"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/jira-dashboard.git
git push -u origin main
```

(Reemplazá `TU-USUARIO` por tu nombre de usuario de GitHub.)

## Paso 3 — Guardar el token de Jira como secret

**Nunca pegues el token en el código.** Guardalo así:

1. En el repo de GitHub, ir a **Settings → Secrets and variables → Actions**
2. Click en **New repository secret** y crear estos tres, uno por uno:

   | Name | Value |
   |---|---|
   | `JIRA_DOMAIN` | `multivista.atlassian.net` |
   | `JIRA_EMAIL` | `mfranchini@voyansi.com` |
   | `JIRA_API_TOKEN` | (tu token, el que generaste en id.atlassian.com) |

## Paso 4 — Activar GitHub Pages

1. En el repo, ir a **Settings → Pages**
2. En "Source", elegir **Deploy from a branch**
3. Branch: `main`, carpeta: `/ (root)`
4. Guardar. GitHub te va a dar una URL tipo:
   `https://TU-USUARIO.github.io/jira-dashboard/`

## Paso 5 — Correr la primera sincronización

Por defecto el workflow corre todos los días a las 08:00 UTC (~05:00
Argentina). Para no esperar hasta la próxima corrida automática:

1. Ir a la pestaña **Actions** del repo
2. Click en el workflow **"Update Jira data"**
3. Click en **Run workflow** (botón a la derecha) → **Run workflow**
4. Esperá ~1 minuto y refrescá la página del dashboard

Si algo falla, el log de esa corrida en la pestaña Actions te va a decir
exactamente qué pasó (token inválido, dominio mal escrito, etc.).

## Sobre el passcode

El passcode por defecto es **`multivista2026`**. **Cambialo** antes de
compartir el link — funciona así:

1. Elegí un passcode nuevo
2. Generá su hash SHA-256. En una terminal (Mac/Linux):
   ```bash
   echo -n "tu-passcode-nuevo" | sha256sum
   ```
   En Windows (PowerShell):
   ```powershell
   $h = [System.Security.Cryptography.SHA256]::Create()
   $b = $h.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("tu-passcode-nuevo"))
   ($b | ForEach-Object { $_.ToString("x2") }) -join ""
   ```
3. Copiá el resultado (una cadena larga de letras y números)
4. En `script.js`, reemplazá el valor de `PASSCODE_HASH_HEX` por ese resultado
5. Subí el cambio (`git add script.js && git commit -m "cambiar passcode" && git push`)

**Importante:** esto filtra el acceso casual, pero no es seguridad real —
el archivo `script.js` es público, así que alguien con conocimientos
técnicos podría intentar forzarlo. No lo uses para datos verdaderamente
sensibles. Si en algún momento necesitás login real por usuario, hay que
sumar un backend (te lo puedo armar aparte).

## Ajustar la frecuencia de sincronización

En `.github/workflows/update-data.yml`, la línea:

```yaml
- cron: "0 8 * * *"
```

controla el horario (formato UTC). Por ejemplo, para que corra una vez por
semana los lunes a la misma hora:

```yaml
- cron: "0 8 * * 1"
```

## Estructura del proyecto

```
jira-dashboard/
├── index.html                     # estructura de la página
├── style.css                      # estilos
├── script.js                      # passcode gate + render del dashboard
├── data/
│   └── data.json                  # snapshot de datos (se sobrescribe solo)
├── scripts/
│   └── fetch-jira-data.js         # script que llama a la API de Jira
├── .github/workflows/
│   └── update-data.yml            # corre el script todos los días
└── package.json
```

## Nota sobre las "sheets" adicionales

Todavía no sumamos la tabla con horas usadas y datos manuales que
mencionaste, porque vive en un plugin de terceros y necesitamos confirmar
cuál es (nombre de la app en **Configuración → Apps → Administrar apps**
de Jira) antes de saber si tiene una API a la que podamos conectarnos.
