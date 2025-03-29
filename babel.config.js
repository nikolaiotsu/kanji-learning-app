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
          "EXPO_PUBLIC_CLAUDE_API_KEY"
        ],
        "safe": false,
        "allowUndefined": false
      }],
      'expo-router/babel'
    ]
  };
}; 