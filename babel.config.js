module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ["module:react-native-dotenv", {
        "moduleName": "@env",
        "path": ".env",
        "blacklist": null,
        "whitelist": [
          "EXPO_PUBLIC_SUPABASE_URL",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY",
          "EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY",
          "EXPO_PUBLIC_CLAUDE_API_KEY",
          "EXPO_PUBLIC_GEMINI_API_KEY",
          "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
          "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
          "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID"
        ],
        "safe": false,
        "allowUndefined": false
      }],
      'react-native-reanimated/plugin'
    ]
  };
}; 