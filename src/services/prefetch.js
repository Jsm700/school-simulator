// src/services/prefetch.js
// Позволява WelcomeScreen да стартира AI заявката за поздрава, докато Quiz екранът
// все още не е монтиран — спестява времето за navigation transition.
let pending = null; // { signature, promise }

export function startGreetingPrefetch(signature, promise) {
  pending = { signature, promise };
}

export function consumeGreetingPrefetch(signature) {
  if (pending && pending.signature === signature) {
    const p = pending.promise;
    pending = null;
    return p;
  }
  pending = null;
  return null;
}
