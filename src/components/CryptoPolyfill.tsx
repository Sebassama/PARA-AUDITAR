// @ts-nocheck
"use client";

import { useEffect } from "react";

export default function CryptoPolyfill() {
    useEffect(() => {
        if (typeof window !== "undefined") {
            // Polyfill simple para randomUUID si no existe (HTTP inseguro)
            if (!window.crypto.randomUUID) {
                console.warn("[CryptoPolyfill] Patching crypto.randomUUID for insecure context");
                (window.crypto as any).randomUUID = () => {
                    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                        var r = (Math.random() * 16) | 0,
                            v = c === "x" ? r : (r & 0x3) | 0x8;
                        return v.toString(16);
                    });
                };
            }
        }
    }, []);

    return null;
}
