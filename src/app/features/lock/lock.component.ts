import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, AuthGroup, GROUP_DEFAULT_ROUTE } from '../../core/services/auth.service';

const GROUP_LABELS: Record<AuthGroup, string> = {
  meta: 'Ads Aromante'
};

@Component({
  selector: 'app-lock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="lock-backdrop">
      <div class="lock-card">
        <div class="lock-icon">&#128274;</div>
        <h2>{{ label }}</h2>
        <p class="lock-hint">Ingresa el PIN de 4 d&iacute;gitos</p>
        <input
          type="tel"
          [(ngModel)]="value"
          maxlength="4"
          placeholder="&#8226;&#8226;&#8226;&#8226;"
          inputmode="numeric"
          pattern="[0-9]*"
          (keydown.enter)="submit()"
          class="lock-input"
          autofocus
        />
        <button (click)="submit()" class="lock-btn">Desbloquear</button>
        <p class="lock-error" *ngIf="error">{{ error }}</p>
      </div>
    </div>
  `,
  styles: [`
    .lock-backdrop {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    .lock-card {
      background: #12122a;
      border: 1px solid #1e1e3e;
      border-radius: 16px;
      padding: 48px 40px 40px;
      text-align: center;
      width: 360px;
      max-width: 90vw;
    }
    .lock-icon {
      font-size: 40px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 22px;
      font-weight: 600;
      color: #f3f4f6;
    }
    .lock-hint {
      margin: 0 0 24px;
      font-size: 13px;
      color: #6b7280;
    }
    .lock-input {
      display: block;
      width: 100%;
      padding: 12px 16px;
      background: #0b0b1a;
      border: 1px solid #2d2d52;
      border-radius: 8px;
      color: #f3f4f6;
      font-size: 18px;
      text-align: center;
      letter-spacing: 6px;
      outline: none;
      transition: border-color 0.15s;
    }
    .lock-input:focus {
      border-color: #f97316;
    }
    .lock-btn {
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
    .lock-btn:hover {
      background: #ea580c;
    }
    .lock-error {
      margin: 16px 0 0;
      color: #ef4444;
      font-size: 13px;
    }
  `]
})
export class LockComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  group!: AuthGroup;
  label = '';
  value = '';
  error = '';

  ngOnInit() {
    this.group = this.route.snapshot.paramMap.get('group') as AuthGroup;
    this.label = GROUP_LABELS[this.group] ?? 'Ads Aromante';
  }

  submit() {
    if (!this.value) return;
    if (this.auth.unlock(this.group, this.value)) {
      this.router.navigateByUrl(GROUP_DEFAULT_ROUTE[this.group] ?? '/dashboard');
    } else {
      this.error = 'PIN incorrecto';
      this.value = '';
    }
  }
}
