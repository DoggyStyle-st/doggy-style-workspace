// ANA036.2 AUTH READY GUARD

let authReady = false;
let authResolvedUser = null;
const authReadyCallbacks = [];

export function onAuthReady(callback) {
    if (authReady) {
        callback(authResolvedUser);
    } else {
        authReadyCallbacks.push(callback);
    }
}

export function initAuthGuard(auth) {
    return new Promise((resolve) => {
        auth.onAuthStateChanged((user) => {
            authResolvedUser = user;
            authReady = true;

            authReadyCallbacks.forEach(cb => cb(user));
            authReadyCallbacks.length = 0;

            resolve(user);
        });
    });
}
