import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Read Firebase config from environment variables (VITE_ prefixed = exposed to client)
// Fall back to imported JSON for backward compatibility during migration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

const app = initializeApp(firebaseConfig);

// Force long-polling with a 15s timeout to bypass AI Studio proxy drops
export const db = initializeFirestore(
  app, 
  { 
    experimentalForceLongPolling: true,
    experimentalLongPollingOptions: { timeoutSeconds: 15 }
  }, 
  firestoreDatabaseId || undefined
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// CRITICAL: Connection test for Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();
export default app;
