import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

@Component({
  selector: 'app-speech-input',
  imports: [CommonModule],
  templateUrl: './speech-input.html',
  styleUrl: './speech-input.scss',
})
export class SpeechInput {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() model: string | null = '';
  @Input() id = '';
  @Input() name = '';
  @Input() type: 'text' | 'email' | 'tel' | 'search' | 'url' = 'text';
  @Input() autocomplete = '';
  @Input() required = false;
  @Input() disabled = false;
  @Input() maxLength: number | null = null;
  @Input() minLength: number | null = null;
  @Input() enableSpeech = true;
  @Output() modelChange = new EventEmitter<string>();

  listening = false;
  unsupported = false;
  private recognizer: InstanceType<SpeechRecognitionCtor> | null = null;
  private readonly nonSpeechTypes = new Set(['password', 'date', 'number']);

  get canShowMic(): boolean {
    return !this.unsupported && this.enableSpeech && !this.disabled && !this.nonSpeechTypes.has(this.type);
  }

  ngOnInit(): void {
    const ctor = (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor })
      .webkitSpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition;
    if (!ctor) {
      this.unsupported = true;
      return;
    }
    this.recognizer = new ctor();
    this.recognizer.lang = 'en-US';
    this.recognizer.interimResults = true;
    this.recognizer.continuous = false;
    this.recognizer.onresult = (event) => {
      const chunks = Array.from(event.results).map((r) => r[0]?.transcript || '');
      this.modelChange.emit(chunks.join(' ').trim());
    };
    this.recognizer.onend = () => {
      this.listening = false;
    };
    this.recognizer.onerror = () => {
      this.listening = false;
    };
  }

  onValueInput(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    this.modelChange.emit(el?.value ?? '');
  }

  toggle(): void {
    if (!this.recognizer || this.disabled || !this.canShowMic) return;
    if (this.listening) {
      this.recognizer.stop();
      this.listening = false;
      return;
    }
    this.recognizer.start();
    this.listening = true;
  }
}
