// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================
// Sigue estos pasos para configurar tu proyecto Firebase:
//
// 1. Ve a https://console.firebase.google.com/
// 2. Crea un nuevo proyecto (nombre: "trading-journal" o el que quieras)
// 3. En el proyecto, ve a "Authentication" > "Get started"
//    - Activa el proveedor "Email/Password"
// 4. Ve a "Firestore Database" > "Create database"
//    - Selecciona "Start in test mode" (luego lo aseguraremos)
//    - Elige la región más cercana a ti
// 5. Ve a Project Settings (icono engranaje) > General
//    - Baja hasta "Your apps" > click en icono Web (</>)
//    - Registra la app (nombre: "trading-journal-web")
//    - Copia los valores de firebaseConfig y pégalos aquí abajo
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCJHf5nvCPmFUiD_TfgadJ4ODWCNwEg5A0",
  authDomain: "trading-journal-c790b.firebaseapp.com",
  projectId: "trading-journal-c790b",
  storageBucket: "trading-journal-c790b.firebasestorage.app",
  messagingSenderId: "322218910001",
  appId: "1:322218910001:web:0572c1a9a910fa973a9010"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
