import { Alert, Platform } from 'react-native';

// React Native's Alert.alert shows nothing on web in this stack, which
// made admin save failures completely invisible (the form simply
// appeared to ignore the Save button). Route one-shot messages to the
// browser's own alert on web so errors are always seen; native keeps
// the regular Alert behaviour.
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
