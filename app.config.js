require('dotenv/config');

module.exports = {
  expo: {
    name: "WordDex",
    slug: "kanji-learning-app",
    version: "1.0.1",
    orientation: "portrait",
    icon: "./assets/worddexiconlogo.png",
    userInterfaceStyle: "dark",
    newArchEnabled: false,
    scheme: "kanjilearningapp",
    splash: {
      image: "./assets/worddexiconlogo.png",
      resizeMode: "contain",
      backgroundColor: "#0A1628",
    },
    plugins: [
      'expo-font',
      'expo-localization',
      'expo-router',
      'expo-dev-client',
      ['expo-splash-screen', {
        backgroundColor: "#0A1628",
        image: "./assets/worddexiconlogo.png",
        resizeMode: "contain",
      }],
      ['expo-screen-orientation', {
        initialOrientation: "PORTRAIT_UP",
      }],
      ['expo-image-picker', {
        photosPermission: "WordDex accesses your photos to create flashcards from images containing text.",
        cameraPermission: "WordDex uses your camera to scan text and create flashcards for language learning.",
      }],
      ['expo-build-properties', {
        ios: {
          deploymentTarget: '16.0',
        },
      }],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.bluve01.kanjilearningapp",
      buildNumber: "2",
      orientation: "portrait",
      config: {
        usesNonExemptEncryption: false,
      },
      entitlements: {
        "com.apple.developer.applesignin": ["Default"],
      },
      infoPlist: {
        UISupportedInterfaceOrientations: [
          "UIInterfaceOrientationPortrait",
        ],
        "UISupportedInterfaceOrientations~ipad": [
          "UIInterfaceOrientationPortrait",
        ],
      },
    },
    android: {
      package: "com.bluve01.kanjilearningapp",
      permissions: ["INTERNET"],
      orientation: "portrait",
      screenOrientation: "portrait",
      adaptiveIcon: {
        foregroundImage: "./assets/worddexiconlogo.png",
        backgroundColor: "#0F172A",
      },
    },
    web: {
      favicon: "./assets/worddexiconlogo.png",
    },
    extra: {
      eas: {
        projectId: "8d650758-11ac-4561-9757-e635a031ac9b",
      },
      EXPO_PUBLIC_CLAUDE_API_KEY: process.env.EXPO_PUBLIC_CLAUDE_API_KEY || process.env.CLAUDE_API_KEY,
    },
  },
};
