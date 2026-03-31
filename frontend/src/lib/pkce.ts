function dec2hex(dec: number): string {
  return ("0" + dec.toString(16)).substr(-2);
}

export function generateCodeVerifier(): string {
  const array = new Uint32Array(56 / 2);
  crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join("");
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateState(): string {
  const array = new Uint32Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join("");
}
