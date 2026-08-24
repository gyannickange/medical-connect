export interface LocalSession {
  userId: string;
  expiresAt: number;
}

export interface SignedLocalSession extends LocalSession {
  sig: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function canonicalPayload(session: LocalSession): Uint8Array {
  return new TextEncoder().encode(`${session.userId}:${session.expiresAt}`);
}

export async function signLocalSession(
  session: LocalSession,
  key: CryptoKey
): Promise<SignedLocalSession> {
  const signature = await crypto.subtle.sign("HMAC", key, canonicalPayload(session));
  return { ...session, sig: toBase64(new Uint8Array(signature)) };
}

export async function verifyLocalSession(
  session: SignedLocalSession,
  key: CryptoKey
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64(session.sig),
      canonicalPayload(session)
    );
  } catch {
    return false;
  }
}
