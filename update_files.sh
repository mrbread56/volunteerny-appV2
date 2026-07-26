#!/bin/bash

# Update firebase config
cat << 'FIREBASE_CONF' > src/firebase/config.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Force long-polling with a 15s timeout to bypass AI Studio proxy drops
export const db = initializeFirestore(
  app, 
  { 
    experimentalForceLongPolling: true,
    experimentalLongPollingOptions: { timeoutSeconds: 15 }
  }, 
  (firebaseConfig as any).firestoreDatabaseId
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
FIREBASE_CONF

# Update .env
cat << 'ENV_CONF' > .env
RESEND_API_KEY=YOUR_RESEND_API_KEY
VITE_SHOW_DEMO_MODE=true
ENV_CONF

