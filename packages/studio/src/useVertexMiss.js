"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";

// Tell the user when a Google model did NOT bill to their own Cloud project.
//
// The router falls back to the reseller so a credential hiccup never kills a
// render — but a fallback that changes WHO gets charged cannot be silent.
// Once per model per session: enough to notice, not enough to nag.
const warned = new Set();

export default function useVertexMiss() {
    useEffect(() => {
        const onMiss = (e) => {
            const { modelId, displayName, reason } = e.detail || {};
            if (!modelId || warned.has(modelId)) return;
            warned.add(modelId);
            toast(
                `${displayName || modelId} não passou pela sua conta Google — foi cobrado no Runware.\n${reason || ""}`.trim(),
                { icon: "⚠️", duration: 8000 },
            );
        };
        window.addEventListener("vertex-miss", onMiss);
        return () => window.removeEventListener("vertex-miss", onMiss);
    }, []);
}
