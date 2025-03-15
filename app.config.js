import 'dotenv/config';

export default {
  expo: {
    name: "kanji-learning-app",
    // ... other existing config
    extra: {
      googleCloudVisionApiKey: process.env.EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY,
      claudeApiKey: process.env.EXPO_PUBLIC_CLAUDE_API_KEY,
    },
    plugins: [
      // ... other plugins
    ],
    android: {
      permissions: [
        "INTERNET"
      ]
    },
  },
}; 