/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Loads an image URL (https, data URI, or blob) and converts it to a base64 Data URL.
 * Safely handles CORS and returns null if the image cannot be loaded.
 */
export async function loadImageAsDataUrl(url: string | undefined | null): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  try {
    const response = await fetch(trimmed, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Could not load image as data URL:", url, err);
    return null;
  }
}

/**
 * Loads an image URL and converts it to a Uint8Array for docx ImageRun.
 */
export async function loadImageAsUint8Array(url: string | undefined | null): Promise<Uint8Array | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith("data:image/")) {
      const commaIdx = trimmed.indexOf(",");
      if (commaIdx === -1) return null;
      const base64 = trimmed.slice(commaIdx + 1);
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    }

    const response = await fetch(trimmed, { mode: "cors" });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.warn("Could not load image as Uint8Array:", url, err);
    return null;
  }
}
