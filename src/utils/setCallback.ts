import type { CFXCallback, CFXParameters } from '../types';

export function setCallback(parameters?: CFXParameters | CFXCallback, cb?: CFXCallback) {
  if (typeof cb === 'function') return cb;
  if (typeof parameters === 'function') return parameters;
}
