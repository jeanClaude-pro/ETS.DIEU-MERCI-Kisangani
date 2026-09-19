import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import type { IScannerControls } from "@zxing/browser";

export type CameraPermissionState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

interface UseZxingScannerOptions {
  onDecode: (text: string) => void;
  active: boolean;
}

/**
 * Continuous CODE128 camera scanning (Part L) for the dedicated scanning
 * surface. USB HID scanners don't use this hook at all — they type into a
 * normal focused input, handled separately in ScanReceipt.tsx.
 */
export function useZxingScanner({ onDecode, active }: UseZxingScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>("idle");

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Deferred a tick so this doesn't set state synchronously within the
      // effect body itself (avoids cascading-render lint/perf concerns).
      queueMicrotask(() => setPermission("unavailable"));
      return;
    }

    let cancelled = false;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
    const reader = new BrowserMultiFormatReader(hints);

    queueMicrotask(() => setPermission("requesting"));
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, error) => {
        if (result) onDecode(result.getText());
        // NotFoundException fires continuously between frames with no
        // barcode in view — expected noise, not a real error.
        else if (error && !(error instanceof NotFoundException)) {
          console.warn("Camera scan error:", error);
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setPermission("granted");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Camera unavailable for scanning:", error);
        setPermission(error?.name === "NotAllowedError" ? "denied" : "unavailable");
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, onDecode, stop]);

  return { videoRef, permission };
}
