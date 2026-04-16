const { EventEmitter } = require('events');

module.exports = {
  EventEmitter,
  Platform: { OS: 'ios' },
  NativeModules: {},
  DeviceEventEmitter: new EventEmitter(),
  AppState: 'active',
  requireNativeModule: () => ({}),
  TurboModuleRegistry: {
    getEnforcing: () => ({}),
    get: () => null,
  },
  CodedError: class CodedError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
  installWebGeolocationPolyfill: () => {},
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
  PermissionResponse: { GRANTED: 'granted', DENIED: 'denied' },
};