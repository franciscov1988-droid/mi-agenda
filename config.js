/* =====================================================================
   CONFIGURACIÓN — Edita SOLO este archivo para activar la nube.
   La app funciona sin tocar nada (modo local en el dispositivo).
   Para sincronizar entre teléfono y PC y usar Google Calendar,
   completa los datos de abajo. Pasos detallados en README.md.
   ===================================================================== */

window.APP_CONFIG = {

  /* --- 1) FIREBASE (sincronización entre dispositivos) -----------------
     Consola: https://console.firebase.google.com
     Crea un proyecto > Agrega una app Web > copia el objeto firebaseConfig
     y pégalo aquí. Activa Authentication (Google) y Firestore Database. */
  firebase: {
    apiKey:            "AIzaSyDyJkaPiaFHm8TorUdEktUHT9tSDXsseT0",
    authDomain:        "agenda-bf2e9.firebaseapp.com",
    projectId:         "agenda-bf2e9",
    storageBucket:     "agenda-bf2e9.firebasestorage.app",
    messagingSenderId: "101033639844",
    appId:             "1:101033639844:web:1b7c49b3ace172f7584b31"
  },

  /* --- 2) GOOGLE CALENDAR (crear/ver eventos) --------------------------
     Google Cloud Console > APIs y servicios > Credenciales >
     "ID de cliente de OAuth 2.0" (tipo: Aplicación web).
     En "Orígenes autorizados de JavaScript" agrega la URL donde publiques
     la app (ej. https://tuusuario.github.io  o  https://tuapp.netlify.app).
     Habilita también "Google Calendar API". Pega el ID aquí: */
  googleClientId: "1037484893371-2voj6kumpsn3ghdcucf09pln1ub9vjjl.apps.googleusercontent.com",

  /* --- Opciones generales --------------------------------------------- */
  appName: "Mi Agenda",
  defaultReminderTime: "19:00"
};
