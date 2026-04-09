import { Injectable, NgZone, inject, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';
export type ToastMessage = { id: number; kind: ToastKind; text: string };

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly zone = inject(NgZone);
  private readonly seq = signal(0);
  readonly items = signal<ToastMessage[]>([]);

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  info(text: string): void {
    this.push('info', text);
  }

  dismiss(id: number): void {
    this.zone.run(() => {
      this.items.update((list) => list.filter((t) => t.id !== id));
    });
  }

  private push(kind: ToastKind, text: string): void {
    this.zone.run(() => {
      const id = this.seq() + 1;
      this.seq.set(id);
      this.items.update((list) => [...list, { id, kind, text }]);
      setTimeout(() => this.dismiss(id), 3600);
    });
  }
}
