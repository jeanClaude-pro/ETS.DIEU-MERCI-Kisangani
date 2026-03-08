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

    if (!res.ok) {
        throw new Error(data?.message || `Request failed (${res.status})`);
    }

    return data as T;
};