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

## Sobre el login

El dashboard pide usuario y contraseña antes de mostrar nada. Las
credenciales actuales son:

- Usuario: `Hex-Multivista`
- Contraseña: `Hexagon`

**Importante:** esto filtra el acceso casual, pero no es seguridad real —
el archivo `auth.js` es público, así que alguien con conocimientos
técnicos podría intentar forzarlo. No lo uses para datos verdaderamente
sensibles.

Para cambiar las credenciales:

1. Elegí un usuario y contraseña nuevos
2. Generá el hash SHA-256 de `usuario:contraseña` (con los dos puntos en
   el medio, tal cual). En una terminal (Mac/Linux):
   ```bash
   echo -n "tu-usuario:tu-contraseña" | sha256sum
   ```
   En Windows (PowerShell):
   ```powershell
   $h = [System.Security.Cryptography.SHA256]::Create()
   $b = $h.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("tu-usuario:tu-contraseña"))
   ($b | ForEach-Object { $_.ToString("x2") }) -join ""
   ```
3. Copiá el resultado y reemplazá el valor de `AUTH_HASH_HEX` en `auth.js`
4. Subí el cambio (`git add auth.js && git commit -m "cambiar credenciales" && git push`)

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
├── index.html                     # Dashboard page (KPIs + charts by territory)
├── issues.html                    # Issues List page (filterable table)
├── laser-support.html             # 3D Laser Support page (flagged components)
├── laser-support.js               # 3D Laser Support page logic
├── auth.js                        # login gate logic
├── logo.svg                       # Hexagon Multivista logo (login screen)
├── shared.js                      # shared data loading + sync status + project modal
├── dashboard.js                   # Dashboard page logic (Chart.js)
├── list.js                        # Issues List page logic
├── style.css                      # estilos
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
