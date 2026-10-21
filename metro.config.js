const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Prefer CommonJS/react-native exports over ESM (.mjs) on web to prevent
// `import.meta.env` syntax errors in non-module Expo web script bundles.
config.resolver.unstable_conditionNames = ["react-native", "browser", "require", "default"];

module.exports = withNativeWind(config, { input: "./global.css" });
