import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { EmptyState } from '../empty-state/empty-state';
import { ErrorState } from '../error-state/error-state';
import { LoadingState } from '../loading-state/loading-state';

@Component({
  selector: 'app-async-state',
  imports: [CommonModule, LoadingState, ErrorState, EmptyState],
  templateUrl: './async-state.html',
  styleUrl: './async-state.scss',
})
export class AsyncState {
  @Input() loading = false;
  @Input() error = '';
  @Input() isEmpty = false;
  @Input() loadingText = 'Loading...';
  @Input() emptyText = 'No records found.';
}
