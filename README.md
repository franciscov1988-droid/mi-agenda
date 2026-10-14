# Mi Agenda 📅✓

Agenda personal de control: tareas diarias con arrastre automático, hábitos recurrentes con barra de progreso, estadísticas de áreas de enfoque, recordatorios y sincronización entre tus dispositivos con Google Calendar integrado.

Es una **PWA** (aplicación web instalable): un solo código que usas en el celular y en la PC, y se instala como app con su propio ícono. Funciona sin internet y, al conectar la nube, mantiene todo sincronizado.

---

## 1. Probarla ya mismo (modo local)

No necesitas configurar nada para empezar. Solo necesitas servir la carpeta (el navegador no permite service workers abriendo el archivo directamente con `file://`).

**Opción rápida con Python:**
```bash
cd agenda-paco
python3 -m http.server 8000
```
Abre `http://localhost:8000` en el navegador.

En este modo los datos se guardan **solo en ese dispositivo**. Para sincronizar entre teléfono y PC, sigue los pasos 3 y 4.

---

## 2. Publicarla (recomendado)

Súbela a **Netlify** o **GitHub Pages** (tu flujo de siempre). Al estar en `https://`, podrás instalarla en el celular y activar notificaciones y Google Calendar.

- **GitHub Pages:** sube el contenido de `agenda-paco/` a un repo y actívalo en *Settings → Pages*.
- **Netlify:** arrastra la carpeta `agenda-paco/` a netlify.com/drop, o conéctala a tu repo.

Anota la URL final (ej. `https://franciscov1988-droid.github.io/mi-agenda/`); la necesitarás en el paso 4.

### Instalar en el celular
Abre la URL en Chrome (Android) → menú ⋮ → **"Agregar a pantalla de inicio" / "Instalar app"**. Quedará con su ícono como una app más.

---

## 3. Activar sincronización entre dispositivos (Firebase)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto (gratis).
2. Agrega una **app Web** (`</>`). Copia el objeto `firebaseConfig` que te muestra.
3. Pega esos valores en **`config.js`**, sección `firebase`.
4. En la consola de Firebase, activa:
   - **Authentication** → pestaña *Sign-in method* → habilita **Google**.
   - **Firestore Database** → *Crear base de datos* (modo producción).
5. En Firestore → *Reglas*, pega esto para que cada usuario solo acceda a sus datos:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /usuarios/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
6. Listo. En la app toca **"Entrar con Google"**: tus tareas aparecerán idénticas en cualquier dispositivo donde inicies sesión.

> Es el mismo stack (Firebase Auth + Firestore) que ya usas en tu app de presupuesto familiar.

---

## 4. Activar Google Calendar (ver y crear eventos)

1. Entra a [Google Cloud Console](https://console.cloud.google.com) (puedes usar el mismo proyecto de Firebase).
2. *APIs y servicios* → **Biblioteca** → busca y habilita **Google Calendar API**.
3. *APIs y servicios* → **Credenciales** → *Crear credenciales* → **ID de cliente de OAuth 2.0** → tipo **Aplicación web**.
4. En **Orígenes autorizados de JavaScript**, agrega la URL donde publicaste la app (paso 2), por ejemplo:
   - `https://franciscov1988-droid.github.io`
   - (y `http://localhost:8000` si quieres probar en local)
5. Copia el **ID de cliente** y pégalo en `config.js`, en `googleClientId`.
6. En la app → pestaña **Agenda** → *Conectar Google Calendar*. Autoriza y verás tus próximos eventos; podrás crear citas desde el botón **+ Nueva cita**.

---

## Funciones

- **Hoy:** tareas del día, agregado rápido, anillo de progreso, filtros (todas / pendientes / hechas / arrastradas).
- **Arrastre automático:** las tareas no completadas pasan solas al día siguiente y se marcan con un contador (`↻ Arrastrada 2×`).
- **Importancia con colores:** Alta (rojo), Media (ámbar), Baja (verde) en el borde de cada tarea.
- **Áreas de enfoque:** clasifica cada tarea/hábito (Trabajo, Legal, Familia, Salud, Espiritual, Personal…). Editables en Ajustes.
- **Hábitos y rutinas:** actividades que se repiten, con barra de progreso semanal, racha 🔥, vista de los últimos 7 días y frecuencia por día de semana.
- **Estadísticas:** completadas por periodo (7/30/90 días), tasa de cumplimiento, mejor racha, gráfico de **áreas de enfoque** (dónde concentras tu esfuerzo) y por nivel de importancia.
- **Agenda / Google Calendar:** ver próximos eventos y crear citas.
- **Recordatorios:** notificación a la hora que elijas si quedan pendientes.
- **Extras:** tema claro/oscuro, respaldo exportar/importar (JSON), instalable, funciona offline.

---

## Estructura

```
agenda-paco/
├─ index.html            Interfaz
├─ styles.css            Estilos (tema claro/oscuro)
├─ app.js                Lógica (tareas, hábitos, stats, nube, calendar)
├─ config.js             👈 ÚNICO archivo a editar para la nube
├─ chart.umd.min.js      Chart.js (local, funciona offline)
├─ sw.js                 Service worker (offline + notificaciones)
├─ manifest.webmanifest  Metadatos PWA
├─ icons/                Íconos de la app
└─ README.md
```

## Privacidad
Sin Firebase, los datos nunca salen de tu dispositivo. Con Firebase, se guardan en tu propio proyecto de Google, accesibles solo con tu cuenta. El token de Google Calendar vive únicamente en la sesión del navegador.
