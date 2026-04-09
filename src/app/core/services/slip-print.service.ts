import { Injectable } from '@angular/core';

export type SlipField = { label: string; value: string };

@Injectable({ providedIn: 'root' })
export class SlipPrintService {
  print(title: string, subtitle: string, fields: SlipField[]): void {
    const popup = window.open('', '_blank', 'width=820,height=920');
    if (!popup) return;

    const rows = fields
      .map(
        (field) => `
          <tr>
            <td class="label">${this.escape(field.label)}</td>
            <td class="value">${this.escape(field.value || '-')}</td>
          </tr>
        `,
      )
      .join('');

    popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${this.escape(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { margin: 0 0 6px; font-size: 20px; }
      p { margin: 0 0 16px; color: #4b5563; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; vertical-align: top; }
      td.label { width: 34%; font-weight: 600; color: #374151; }
      td.value { white-space: pre-wrap; }
      .foot { margin-top: 14px; color: #6b7280; font-size: 11px; }
    </style>
  </head>
  <body>
    <h1>${this.escape(title)}</h1>
    <p>${this.escape(subtitle)}</p>
    <table>${rows}</table>
    <p class="foot">Generated at ${this.escape(new Date().toLocaleString())}</p>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
    popup.document.close();
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
