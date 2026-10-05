const listeners = new Set();

export const AppState = {
  currentState: 'active',
  addEventListener(type, listener) {
    if (type === 'change') {
      listeners.add(listener);
      return {
        remove: () => listeners.delete(listener),
      };
    }
    return { remove: () => {} };
  },
  _setAppState(newState) {
    this.currentState = newState;
    for (const listener of Array.from(listeners)) {
      listener(newState);
    }
  },
  _listenerCount() {
    return listeners.size;
  },
  _reset() {
    this.currentState = 'active';
    listeners.clear();
  },
};

export const StyleSheet = {
  create: (styles) => styles,
};

export const Platform = {
  OS: 'android',
  select: (obj) => obj.android ?? obj.default,
};

export class View {}
export class Text {}
export class Pressable {}
export class TextInput {}
export class ScrollView {}
export class Switch {}

export const Vibration = {
  _calls: [],
  vibrate(pattern, repeat) {
    this._calls.push({ type: 'vibrate', pattern, repeat });
  },
  cancel() {
    this._calls.push({ type: 'cancel' });
  },
  _reset() {
    this._calls = [];
  },
};

export const Alert = {
  alert: (title, message, buttons) => {},
};

export const TurboModuleRegistry = {
  get: () => null,
  getEnforcing: (name) => {
    throw new Error(`TurboModule ${name} not available in mock`);
  },
};

export default {
  Vibration,
  AppState,
  StyleSheet,
  Platform,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  TurboModuleRegistry,
};
