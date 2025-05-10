const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  
  // Add custom config here
  const { transformer, resolver } = config;
  
  // Add additional resolver extensions for TypeScript files
  config.resolver = {
    ...resolver,
    sourceExts: [...resolver.sourceExts, 'mjs'],
  };
  
  return config;
})(); 