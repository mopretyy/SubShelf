import type { CapacitorConfig } from '@capacitor/cli'

// Keep appId: it is the store identity (Google Play package / iOS bundle id) and existing installs update by it.
const config: CapacitorConfig = {
  appId: 'io.github.dimon4w.subshelf',
  appName: 'SubShelf',
  webDir: 'dist',
  // One light style everywhere: the WebView never flashes black before the app paints.
  backgroundColor: '#eaeaea',
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#eaeaea',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_subshelf',
      iconColor: '#ff3616',
    },
  },
}

export default config
