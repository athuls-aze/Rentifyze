// config.js
// NOTE: This project is a pure static front-end app using Firebase client SDK.
// Firebase *client-side* config keys (apiKey, projectId, etc.) are designed
// to be public — they are NOT secret. Security is enforced through
// Firebase Security Rules in your Firestore/Storage console.
//
// For server-side secrets (JWT_SECRET, ADMIN_PASSKEY, etc.) use
// environment variables via Netlify Dashboard → Site settings → Env vars.

// ─── Firebase Client Config ──────────────────────────────────────────────────
// These values are read from the environment at build-time (if using a bundler)
// or kept here for direct static hosting.  For Netlify, set them in the
// Netlify dashboard and they will be injected via the Netlify build pipeline
// if you ever add a build step.  For a pure-static site they remain in
// firebase-config.js (which is safe to expose, per Firebase documentation).
// ─────────────────────────────────────────────────────────────────────────────

const AppConfig = {
    firebase: {
        apiKey:            window._env_?.FIREBASE_API_KEY            || "",
        authDomain:        window._env_?.FIREBASE_AUTH_DOMAIN        || "",
        projectId:         window._env_?.FIREBASE_PROJECT_ID         || "",
        storageBucket:     window._env_?.FIREBASE_STORAGE_BUCKET     || "",
        messagingSenderId: window._env_?.FIREBASE_MESSAGING_SENDER_ID|| "",
        appId:             window._env_?.FIREBASE_APP_ID             || "",
        measurementId:     window._env_?.FIREBASE_MEASUREMENT_ID     || ""
    }
};
