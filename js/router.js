import { auth } from './firebase-init.js';

export function initRouter() {
    if (!auth.currentUser) {
        console.warn('Router init blocked – auth not ready');
        return;
    }

    // Router-Initialisierung wie bisher
}
