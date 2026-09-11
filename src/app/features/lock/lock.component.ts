import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-backdrop">
      <div class="login-card">
        <div class="login-brand">
          <span class="logo">&#9670;</span>
          <span class="name">Ads Aromante</span>
        </div>

        <!-- Magic Link Form -->
        <div *ngIf="!sent()">
          <p class="login-hint">Ingresa tu email para recibir un link de acceso</p>
          <input
            type="email"
            [(ngModel)]="email"
            placeholder="tu@aromante.mx"
            (keydown.enter)="sendLink()"
            class="login-input"
            autofocus
          />
          <button (click)="sendLink()" class="login-btn" [disabled]="sending()">
            {{ sending() ? 'Enviando...' : 'Enviar link de acceso' }}
          </button>
          <p class="login-error" *ngIf="error()">{{ error() }}</p>
        </div>

        <!-- Confirmation -->
        <div *ngIf="sent()">
          <div class="sent-icon">&#9993;</div>
          <p class="login-hint">
            Revisa tu email <strong>{{ email }}</strong>.<br>
            Haz click en el link para entrar.
          </p>
          <button (click)="reset()" class="login-link">Usar otro email</button>
        </div>

        <!-- Passkey Login -->
        <div class="passkey-section" *ngIf="!sent() && hasPasskeySupport">
          <div class="divider"><span>o</span></div>
          <button (click)="loginWithPasskey()" class="passkey-btn" [disabled]="sending()">
            &#128275; Entrar con Touch ID
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-backdrop {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .login-card {
      background: #12122a;
      border: 1px solid #1e1e3e;
      border-radius: 16px;
      padding: 48px 40px 40px;
      text-align: center;
      width: 400px;
      max-width: 90vw;
    }
    .login-brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 32px;
    }
    .login-brand .logo { color: #f97316; font-size: 28px; }
    .login-brand .name { font-size: 20px; font-weight: 600; color: #f3f4f6; }
    .login-hint {
      margin: 0 0 20px;
      font-size: 13px;
      color: #9ca3af;
      line-height: 1.5;
    }
    .login-input {
      display: block;
      width: 100%;
      padding: 12px 16px;
      background: #0b0b1a;
      border: 1px solid #2d2d52;
      border-radius: 8px;
      color: #f3f4f6;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s;
    }
    .login-input:focus { border-color: #f97316; }
    .login-btn {
      display: block;
      width: 100%;
      margin-top: 16px;
      padding: 12px;
      background: #f97316;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .login-btn:hover:not(:disabled) { background: #ea580c; }
    .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .login-error {
      margin: 16px 0 0;
      color: #ef4444;
      font-size: 13px;
    }
    .login-link {
      background: none;
      border: none;
      color: #f97316;
      font-size: 13px;
      cursor: pointer;
      margin-top: 16px;
    }
    .login-link:hover { text-decoration: underline; }
    .sent-icon { font-size: 48px; margin-bottom: 16px; }
    .divider {
      display: flex;
      align-items: center;
      margin: 24px 0 20px;
      span {
        padding: 0 12px;
        color: #4b5563;
        font-size: 12px;
      }
      &::before, &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #1e1e3e;
      }
    }
    .passkey-btn {
      display: block;
      width: 100%;
      padding: 12px;
      background: #1a1a3a;
      color: #f3f4f6;
      border: 1px solid #2d2d52;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .passkey-btn:hover:not(:disabled) {
      background: #22224a;
      border-color: #f97316;
    }
    .passkey-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .passkey-section { margin-top: 8px; }
  `]
})
export class LockComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  sent = signal(false);
  sending = signal(false);
  error = signal('');

  hasPasskeySupport = typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function';

  constructor() {
    // Redirect when auth state changes (magic link callback or already logged in)
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.router.navigateByUrl('/dashboard');
      }
    });
  }

  async sendLink() {
    if (!this.email || this.sending()) return;

    this.sending.set(true);
    this.error.set('');

    const { error } = await this.auth.sendMagicLink(this.email);

    if (error) {
      this.error.set(error);
      this.sending.set(false);
    } else {
      this.sent.set(true);
      this.sending.set(false);
    }
  }

  reset() {
    this.sent.set(false);
    this.email = '';
    this.error.set('');
  }

  private readonly FUNCTIONS_URL = 'https://bszfkudigjiqddliicri.supabase.co/functions/v1/webauthn-auth';

  async loginWithPasskey() {
    this.sending.set(true);
    this.error.set('');

    try {
      // 1. Get authentication options from edge function
      const optionsRes = await fetch(this.FUNCTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'authenticate-options',
          rpId: window.location.hostname
        })
      });
      const options = await optionsRes.json();
      if (options.error) { this.error.set(options.error); return; }

      // 2. Ask browser for passkey assertion (Touch ID prompt)
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: this.base64UrlToBuffer(options.challenge),
          rpId: options.rpId,
          timeout: options.timeout,
          userVerification: options.userVerification,
          allowCredentials: (options.allowCredentials || []).map((c: any) => ({
            id: this.base64UrlToBuffer(c.id),
            type: c.type,
            transports: c.transports
          }))
        }
      }) as PublicKeyCredential | null;

      if (!credential) {
        this.error.set('No se pudo verificar la identidad');
        return;
      }

      // 3. Send assertion to edge function for verification
      const res = await fetch(this.FUNCTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'authenticate',
          credential_id: this.bufferToBase64Url(credential.rawId)
        })
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        this.error.set(result.error ?? 'Error de autenticación');
        return;
      }

      // 4. Set session from the token returned by the edge function
      if (result.access_token) {
        const supa = this.auth['supa'] as any;
        await supa.client.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token
        });
        this.router.navigateByUrl('/dashboard');
      }
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        this.error.set('Autenticación cancelada');
      } else {
        this.error.set(e.message ?? 'Error al verificar passkey');
      }
    } finally {
      this.sending.set(false);
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
}
