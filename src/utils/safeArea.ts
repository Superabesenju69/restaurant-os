import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Provides cross-platform safe area padding values that guarantee
 * top headers and modals never overlap with the phone's system status bar,
 * camera punch-hole/notch, or bottom gesture navigation bar.
 */
export function useSafePadding() {
  const insets = useSafeAreaInsets();
  const androidMinTop = Platform.OS === 'android' ? Math.max(RNStatusBar.currentHeight || 0, 36) : 0;
  const topPad = Math.max(insets.top, androidMinTop);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 0);

  return {
    topPad,
    bottomPad,
    leftPad: insets.left,
    rightPad: insets.right,
  };
}
