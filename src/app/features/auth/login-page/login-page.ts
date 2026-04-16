import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
export class LoginPage implements OnInit {
  readonly showDemoCredentials = !environment.production;
  readonly demoAccounts = DEMO_LOGIN_ACCOUNTS;

  private readonly route = inject(ActivatedRoute);

  username = '';
  password = '';
  showPassword = false;
  busy = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'staff') {
      this.error =
        'You are not eligible to use the staff console. Sign in with a staff account, or use the patient app for patient access.';
    }
  }

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
