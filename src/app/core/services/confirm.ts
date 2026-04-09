import { Injectable, NgZone, inject, signal } from '@angular/core';

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
};

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly zone = inject(NgZone);
  readonly state = signal<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    danger: false,
  });

  private resolver: ((value: boolean) => void) | null = null;

  ask(opts: Partial<Omit<ConfirmState, 'open'>> & { message: string }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.zone.run(() => {
        this.state.set({
          open: true,
          title: opts.title || 'Please confirm',
          message: opts.message,
          confirmText: opts.confirmText || 'Confirm',
          cancelText: opts.cancelText || 'Cancel',
          danger: !!opts.danger,
        });
        this.resolver = resolve;
      });
    });
  }

  resolve(value: boolean): void {
    this.zone.run(() => {
      this.state.update((s) => ({ ...s, open: false }));
      const r = this.resolver;
      this.resolver = null;
      if (r) r(value);
    });
  }
}
