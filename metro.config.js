const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  
  // Add custom config here
  const { transformer, resolver } = config;
  
  // Add additional resolver extensions for TypeScript files
  config.resolver = {
    ...resolver,
    sourceExts: [...resolver.sourceExts, 'mjs'],
    // Resolve React Native specific modules and exclude Node.js specific ones
    resolverMainFields: ['react-native', 'browser', 'main'],
    platforms: ['ios', 'android', 'native', 'web'],
    // Exclude Node.js specific modules and test files from being bundled
    blockList: [
      /node_modules\/ws\//,
      /node_modules\/bufferutil/,
      /node_modules\/utf-8-validate/,
      /.*\/__tests__\/.*/,  // Exclude all __tests__ directories
      /.*\.test\.(js|ts|tsx)$/,  // Exclude all .test files
      /.*\.spec\.(js|ts|tsx)$/,  // Exclude all .spec files
    ],
    // Custom resolver for Node.js modules
    resolveRequest: (context, moduleName, platform) => {
      // Block ws module entirely for React Native
      if (moduleName === 'ws' || moduleName.startsWith('ws/')) {
        return {
          filePath: require.resolve('react-native/Libraries/vendor/emitter/EventEmitter'),
          type: 'sourceFile',
        };
      }
      
      // Block other problematic Node.js modules
      if (moduleName === './lib/stream' && context.originModulePath?.includes('node_modules/ws')) {
        return {
          filePath: require.resolve('react-native/Libraries/vendor/emitter/EventEmitter'),
          type: 'sourceFile',
        };
      }

      // Use default resolver for everything else
      return context.resolveRequest(context, moduleName, platform);
    },
  };
  
  return config;
})(); 