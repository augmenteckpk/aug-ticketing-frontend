import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth';
import { ConfirmDialog } from './ui-kit/confirm-dialog/confirm-dialog';
import { ToastOutlet } from './ui-kit/toast-outlet/toast-outlet';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastOutlet, ConfirmDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor(private readonly auth: AuthService) {
    void this.auth.bootstrap();
  }
}
