import { cert, getApps, initializeApp } from "npm:firebase-admin/app";
import { getMessaging, Messaging } from "npm:firebase-admin/messaging";
import { ServiceAccount } from "npm:firebase-admin";

const serviceAccount = {
  "type": "service_account",
  "project_id": "notiyou",
  "private_key_id": Deno.env.get("FIREBASE_PRIVATE_KEY_ID"),
  "private_key": Deno.env.get("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n"),
  "client_email": "firebase-adminsdk-fbsvc@notiyou.iam.gserviceaccount.com",
  "client_id": Deno.env.get("FIREBASE_CLIENT_ID"),
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url":
    "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40notiyou.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com",
} as ServiceAccount;

// Firebase 앱이 이미 초기화되지 않은 경우에만 초기화
export const firebaseApp = getApps().length === 0
  ? initializeApp({
    credential: cert(serviceAccount),
  })
  : getApps()[0];

export const firebaseMessaging = getMessaging(firebaseApp);

export type { Messaging };
