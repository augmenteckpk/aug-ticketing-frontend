import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-toast-outlet',
  imports: [CommonModule],
  templateUrl: './toast-outlet.html',
  styleUrl: './toast-outlet.scss',
})
export class ToastOutlet {
  readonly toast = inject(ToastService);
}
