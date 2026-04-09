import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  imports: [],
  templateUrl: './loading-state.html',
  styleUrl: './loading-state.scss',
})
export class LoadingState {
  @Input() text = 'Loading...';
}
