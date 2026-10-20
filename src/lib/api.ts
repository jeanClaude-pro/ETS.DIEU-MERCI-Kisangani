/* eslint-disable @typescript-eslint/no-explicit-any */

import { serverUrl } from "../utils/constants";

export async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const res = await fetch(`${serverUrl}/${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    const data = (await res.json().catch(() => ({}))) as any;

    // TOKEN_EXPIRED was already renewed-and-retried by the session keeper;
    // if renewal is temporarily impossible the session is kept, not ended.
    if (res.status === 401 && data?.code !== 'TOKEN_EXPIRED' && typeof window !== 'undefined' && localStorage.getItem('token')) {
        window.dispatchEvent(new CustomEvent('auth-required'));
    }

    if (!res.ok) {
        throw new Error(data?.message || `Request failed (${res.status})`);
    }

    return data as T;
};
