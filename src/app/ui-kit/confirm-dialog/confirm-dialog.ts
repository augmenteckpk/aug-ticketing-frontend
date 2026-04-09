import { CommonModule } from '@angular/common';
import { Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from '../../core/services/confirm';

@Component({
  selector: 'app-confirm-dialog',
  imports: [CommonModule],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  readonly confirm = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirm.state().open) this.confirm.resolve(false);
  }
}
