import 'dotenv/config';

// Debug logs to check environment variables
console.log('Loading environment variables in app.config.js:');
console.log('EXPO_PUBLIC_SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'defined' : 'undefined');
console.log('EXPO_PUBLIC_SUPABASE_ANON_KEY:', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'defined' : 'undefined');

export default {
  expo: {
    name: "kanji-learning-app",
    // ... other existing config
    scheme: "kanjiapp",
    plugins: [
      // ... other plugins
    ],
    android: {
      permissions: [
        "INTERNET"
      ]
    },
    ios: {
      bundleIdentifier: "com.yourcompany.kanjilearningapp",
      config: {
        usesNonExemptEncryption: false
      }
    },
    android: {
      package: "com.yourcompany.kanjilearningapp",
      permissions: ["INTERNET"]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      eas: {
        projectId: "your-project-id"
      }
    },
    newArchEnabled: true,
  },
}; 