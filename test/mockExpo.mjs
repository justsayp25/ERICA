export class NativeModule {}
export function requireNativeModule(name) {
  return {
    isAvailableAsync: async () => false,
    sendSilentSms: async () => false,
  };
}
export function registerWebModule(moduleClass, name) {
  return new moduleClass();
}
export default {
  NativeModule,
  requireNativeModule,
  registerWebModule,
};
