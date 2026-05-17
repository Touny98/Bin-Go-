# BinGo! 🎰 - Plataforma Operacional de Bingo en Tiempo Real vía WhatsApp

BinGo! es una plataforma innovadora, robusta y altamente escalable que permite la gestión y el juego en vivo de salas de Bingo interactivas utilizando **WhatsApp** como canal conversacional principal. El sistema cuenta con una arquitectura moderna dirigida por eventos en tiempo real, respaldada por bases de datos relacionales, almacenamiento en caché y colas de tareas con reintentos automáticos.

---

## 🚀 Arquitectura y Tecnologías Core

- **Backend**: Node.js + TypeScript + Express.
- **Base de Datos**: PostgreSQL para persistencia transaccional (cartones, estados, compras, retiros).
- **Caché y Colas**: Redis + BullMQ (gestión de sorteos, reintentos de webhooks y notificaciones).
- **Mensajería**: WhatsApp Web Headless (`whatsapp-web.js`) desacoplado con soporte para Modo Mock.
- **Frontend Admin**: Next.js + React para la visualización operacional y control financiero.
- **Realtime**: WebSockets con Socket.io sincronizado a través de adaptadores de Redis.

---

## 🛠️ Guía de Inicio Rápido (Desarrollo Local)

### Requisitos Previos

Asegúrate de tener instalados los siguientes componentes en tu sistema local:
1. **Node.js** (versión 18 o superior).
2. **Docker** y **Docker Compose**.

### Paso 1: Levantar Infraestructura Local

Para iniciar las bases de datos de PostgreSQL y Redis en tu entorno local, ejecuta:

```bash
docker-compose up -d
```

### Paso 2: Configurar Variables de Entorno

Copia el archivo de plantilla a tu entorno local:

```bash
cp .env.example .env
```

Edita el archivo `.env` configurando las credenciales de tu base de datos y llaves de desarrollo.

### Paso 3: Inicializar y Sembrar la Base de Datos

Para crear el esquema relacional y poblar las salas virtuales predeterminadas (*Bingo Express*, *Mega Sábado*, *High Rollers*):

```bash
npm run seed
```

### Paso 4: Levantar el Servidor en Desarrollo

Para levantar la API, los WebSockets y el proveedor de WhatsApp:

```bash
npm run dev
```

* **Nota**: Si tienes la variable `WHATSAPP_MOCK=false`, se imprimirá un código QR en la consola de comandos. Escanéalo desde tu teléfono para vincular la línea de la asistente. Si tienes `WHATSAPP_MOCK=true`, el sistema levantará de forma instantánea sin abrir el navegador headless ni requerir teléfono.

---

## 🧪 Simulación de Flujo Completo E2E

Para validar el sistema completo sin requerir una conexión real a WhatsApp, hemos diseñado un simulador interactivo de extremo a extremo que recrea la experiencia de un usuario desde su registro hasta la adjudicación de su premio:

```bash
npm run simulate:flow
```

Este script automatiza en tiempo real:
1. Registro de usuario e interacción inicial.
2. Compra de cartones de Bingo con firma de integridad.
3. Confirmación de pago simulada a través de webhook.
4. Generación visual y renderizado de cartones.
5. Sorteo automático de bolas con alertas "Near-Win".
6. Detección automática del cartón ganador y dispersión contable de fondos.

---

## 📂 Estructura del Proyecto

```text
├── apps/
│   └── admin-web/          # Dashboard de Operaciones, Riesgo y Finanzas (Next.js)
├── frontend/
│   └── src/                # Landing Page pública y analíticas de captación
├── src/
│   ├── conversation/       # Orquestador del flujo conversacional de WhatsApp
│   ├── db/                 # Conexión relacional y migraciones de PostgreSQL
│   ├── domain/             # Lógica de dominio (Reservas, Compras y Pagos)
│   ├── engine/             # Motor de sorteos, RNG y validación de cartones
│   ├── infra/              # Observabilidad, Telemetría y Healthchecks
│   ├── notifications/      # Capa de notificaciones y adaptadores de WhatsApp
│   ├── queue/              # Inicialización de colas de BullMQ
│   ├── realtime/           # Sockets, salas realtime y Replay persistence
│   ├── scripts/            # Semillas y utilitarios de simulación E2E
│   └── workers/            # Consumidores distribuidos de colas de BullMQ
```

---

## 🌐 Despliegue en Staging y Producción

Hemos automatizado todo el ciclo de despliegue mediante scripts robustos en el directorio raíz:
- **`deploy.sh`**: Realiza tags automáticos de respaldo en Git, descarga los últimos cambios y levanta la suite en producción.
- **`healthcheck.sh`**: Valida de manera silenciosa si la API y los servicios de base de datos están saludables.
- **`rollback.sh`**: Ejecuta un checkout de emergencia hacia el último tag estable detectado ante cualquier incidente.
- **`certbot-init.sh`**: Autogestiona e instala certificados SSL Let's Encrypt de forma automática.

---

## 📋 Variables de Entorno Clave (`.env`)

| Variable | Descripción | Valor Local Sugerido |
| :--- | :--- | :--- |
| `PORT` | Puerto de escucha de la API Express | `3000` |
| `NODE_ENV` | Entorno de ejecución | `development` / `production` |
| `DATABASE_URL` | URI de conexión a PostgreSQL | `postgres://bingo_user:bingo_password@localhost:5432/bingo_db` |
| `REDIS_URL` | URI de conexión al servicio de Redis | `redis://localhost:6379` |
| `WHATSAPP_MOCK` | Activar simulación/mock de WhatsApp | `true` (para testing local) \| `false` |
| `MP_ACCESS_TOKEN` | Token de acceso para la pasarela MercadoPago | `your_mp_access_token` |
