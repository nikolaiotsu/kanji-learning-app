import 'dotenv/config';

// Debug logs to check environment variables
console.log('Loading environment variables in app.config.js:');
console.log('EXPO_PUBLIC_SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'defined' : 'undefined');
console.log('EXPO_PUBLIC_SUPABASE_ANON_KEY:', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'defined' : 'undefined');
console.log('EXPO_PUBLIC_CLAUDE_API_KEY:', process.env.EXPO_PUBLIC_CLAUDE_API_KEY ? 'defined' : 'undefined');
console.log('CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'defined' : 'undefined');

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
      bundleIdentifier: "com.bluve01.kanjilearningapp",
      config: {
        usesNonExemptEncryption: false
      }
    },
    android: {
      package: "com.bluve01.kanjilearningapp",
      permissions: ["INTERNET"]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      eas: {
        projectId: "8d650758-11ac-4561-9757-e635a031ac9b"
      },
      EXPO_PUBLIC_CLAUDE_API_KEY: process.env.EXPO_PUBLIC_CLAUDE_API_KEY || process.env.CLAUDE_API_KEY
    },
    newArchEnabled: true,
  },
}; 