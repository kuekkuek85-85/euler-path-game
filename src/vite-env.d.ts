/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** 교사 모드 PIN 6자리. 코드에 하드코딩하지 않는다 (PRD 5.5). */
  readonly VITE_TEACHER_PIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
