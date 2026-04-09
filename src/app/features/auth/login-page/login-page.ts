import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth';
import { SpeechInput } from '../../../ui-kit/speech-input/speech-input';
import { DEMO_LOGIN_ACCOUNTS, type DemoLoginAccount } from './demo-credentials';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule, SpeechInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  readonly showDemoCredentials = !environment.production;
  readonly demoAccounts = DEMO_LOGIN_ACCOUNTS;

  username = '';
  password = '';
  showPassword = false;
  busy = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  fillDemo(row: DemoLoginAccount): void {
    this.username = row.username;
    this.password = row.password;
    this.error = '';
  }

  async submit(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await this.auth.login(this.username.trim(), this.password);
      await this.router.navigate(['/app']);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      this.busy = false;
    }
  }
}
