/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_STORE?: string
  readonly VITE_RC_ANDROID_KEY?: string
  readonly VITE_RC_IOS_KEY?: string
  readonly VITE_LICENSE_PUBKEY?: string
  readonly VITE_BUY_URL?: string
  readonly VITE_SUPPORT_EMAIL?: string
  readonly VITE_PRIVACY_URL?: string
  readonly VITE_TERMS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
