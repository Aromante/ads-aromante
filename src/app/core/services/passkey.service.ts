import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

const FUNCTIONS_URL = 'https://bszfkudigjiqddliicri.supabase.co/functions/v1/webauthn-auth';

@Injectable({ providedIn: 'root' })
export class PasskeyService {
  private supa = inject(SupabaseService);
  private auth = inject(AuthService);

  async hasPasskey(): Promise<boolean> {
    const user = this.auth.user();
    if (!user) return false;

    const { data } = await this.supa.client
      .from('passkey_credentials')
      .select('id')
      .eq('user_id', user.id)
      .not('credential_id', 'like', '__pending_%')
      .limit(1);

    return (data?.length ?? 0) > 0;
  }

  async registerPasskey(): Promise<{ success: boolean; error?: string }> {
    try {
      const session = await this.auth.getSession();
      if (!session) return { success: false, error: 'No session' };

      // 1. Get registration options from edge function
      const optionsRes = await fetch(FUNCTIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'register-options',
          rpId: window.location.hostname
        })
      });

      const options = await optionsRes.json();
      if (options.error) return { success: false, error: options.error };

      // 2. Create credential with browser WebAuthn API
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: this.base64UrlToBuffer(options.challenge),
          rp: options.rp,
          user: {
            id: this.base64UrlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName
          },
          pubKeyCredParams: options.pubKeyCredParams,
          authenticatorSelection: options.authenticatorSelection,
          timeout: options.timeout,
          attestation: options.attestation
        }
      }) as PublicKeyCredential | null;

      if (!credential) {
        return { success: false, error: 'Registration cancelled' };
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // 3. Send credential to edge function for storage
      const verifyRes = await fetch(FUNCTIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'register-verify',
          credential_id: this.bufferToBase64Url(credential.rawId),
          public_key: this.bufferToBase64Url(response.getPublicKey()!),
          device_name: this.getDeviceName()
        })
      });

      const result = await verifyRes.json();
      if (result.error) return { success: false, error: result.error };

      return { success: true };
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        return { success: false, error: 'Registro cancelado' };
      }
      return { success: false, error: e.message };
    }
  }

  private base64UrlToBuffer(b64url: string): ArrayBuffer {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  private bufferToBase64Url(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private getDeviceName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Mac')) return 'Mac Touch ID';
    if (ua.includes('iPhone')) return 'iPhone Face ID';
    if (ua.includes('iPad')) return 'iPad Touch ID';
    return 'Passkey';
  }
}
