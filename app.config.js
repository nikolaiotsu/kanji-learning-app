import 'dotenv/config';

// Environment variables loaded for app configuration

export default {
  expo: {
    name: "WordDex",
    slug: "kanji-learning-app",
    // ... other existing config
    scheme: "kanjiapp",
    plugins: [
      'expo-font',
      'expo-localization',
      'expo-router',
      ['expo-build-properties', {
        ios: {
          deploymentTarget: '16.0',
        },
      }],
    ],
    android: {
      permissions: [
        "INTERNET"
      ]
    },
    ios: {
      bundleIdentifier: "com.bluve01.kanjilearningapp",
      buildNumber: "2",
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
    newArchEnabled: false,
  },
}; 