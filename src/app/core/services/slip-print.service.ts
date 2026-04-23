import { Injectable } from '@angular/core';
import {
  LAB_REQUEST_FORM,
  RADIOLOGY_REQUEST_FORM,
  REGISTRATION_SLIP_BRAND,
} from '../constants/registration-slip-brand';

export type SlipField = { label: string; value: string };

export type SlipPrintOptions = {
  /** PNG data URL from e.g. `qrcode.toDataURL`. */
  qrDataUrl?: string;
  qrCaption?: string;
};

export type PatientRegistrationSlipInput = {
  instituteLine1?: string;
  instituteLine2?: string;
  formTitle?: string;
  formSubtitle?: string;
  /**
   * OPD lane + clinic, e.g. `OPD14 / Prostate Clinic` (display code + clinic name).
   * Built from `opd_display_code` (or `opd_name`) + `clinic_name` at print time.
   */
  opdClinicLine?: string | null;
  tokenDisplay: string;
  wNumber: string | null | undefined;
  visitDateTimeLabel: string;
  patientName: string;
  fatherName: string | null | undefined;
  gender: string | null | undefined;
  cnic: string | null | undefined;
  heightCm: number | string | null | undefined;
  weightKg: number | string | null | undefined;
  ageLabel: string;
  /** Same hex string as mobile / walk-in visit barcode (CODE128). */
  visitBarcodeHex: string | null | undefined;
  /** Stored clinical notes (HTML); unsafe tags stripped for print. */
  notesHtml: string;
};

export type LabRequestFormInput = {
  formNumber: string;
  patientName: string;
  ageLabel: string;
  visitNo: string;
  locationLine: string;
  dateLine: string;
  opdClinicLine: string;
  testsPlain: string;
  requestingDoctor: string;
  qrDataUrl?: string;
};

export type RadiologyRequestFormInput = {
  formNumber: string;
  patientName: string;
  ageLabel: string;
  sexLabel: string;
  bedNo: string;
  examinationsPlain: string;
  requestingDoctor: string;
  dateRequested: string;
  qrDataUrl?: string;
};

@Injectable({ providedIn: 'root' })
export class SlipPrintService {
  print(title: string, subtitle: string, fields: SlipField[], options?: SlipPrintOptions): void {
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

    const qrBlock =
      options?.qrDataUrl && options.qrDataUrl.startsWith('data:image/')
        ? `<div class="qr-wrap">
             <img src="${this.escapeAttr(options.qrDataUrl)}" alt="Verification QR" width="180" height="180" />
             <p class="qr-cap">${this.escape(options.qrCaption ?? 'Scan to verify slip contents')}</p>
           </div>`
        : '';

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
      .qr-wrap { margin: 16px 0; text-align: center; }
      .qr-cap { margin: 8px 0 0; color: #4b5563; font-size: 11px; }
    </style>
  </head>
  <body>
    <h1>${this.escape(title)}</h1>
    <p>${this.escape(subtitle)}</p>
    ${qrBlock}
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

  /**
   * Doctor’s pad–style patient registration slip: letterhead, demographics, visit CODE128,
   * and a large ruled area for clinical notes (HTML from consultation RTE).
   */
  async printPatientRegistrationSlip(raw: PatientRegistrationSlipInput): Promise<void> {
    const popup = window.open('', '_blank', 'width=900,height=1100');
    if (!popup) return;

    const brand = REGISTRATION_SLIP_BRAND;
    const instituteLine1 = raw.instituteLine1 ?? brand.instituteLine1;
    const instituteLine2 = raw.instituteLine2 ?? brand.instituteLine2;
    const formTitle = raw.formTitle ?? 'Patient Registration Form';
    const formSubtitle = raw.formSubtitle ?? brand.formSubtitle;
    const logoSrc = `${window.location.origin}${REGISTRATION_SLIP_BRAND.slipLogoPath}`;
    const barcodeImg = await this.visitBarcodePngDataUrl(raw.visitBarcodeHex);
    const notesSafe = this.sanitizeNotesForPrint(raw.notesHtml);
    const notesEmpty = this.isEffectivelyEmptyHtml(raw.notesHtml);

    const opdClinicRow =
      raw.opdClinicLine !== undefined
        ? `<div class="meta-row meta-row--single">
        <div class="meta-cell">
          <span class="meta-k">OPD / Clinic</span>
          <span class="meta-v">${this.escape(this.fmtText(raw.opdClinicLine))}</span>
        </div>
      </div>`
        : '';

    const metaRows = [
      [
        { k: 'Token', v: raw.tokenDisplay || '—' },
        { k: 'W number', v: this.fmtText(raw.wNumber) },
      ],
      [
        { k: 'Visit date & time', v: raw.visitDateTimeLabel || '—' },
        { k: 'Patient name', v: raw.patientName || '—' },
      ],
      [
        { k: "S/O (father's name)", v: this.fmtText(raw.fatherName) },
        { k: 'Gender', v: this.fmtText(raw.gender) },
      ],
      [
        { k: 'CNIC', v: this.fmtText(raw.cnic) },
        { k: 'Age', v: raw.ageLabel || '—' },
      ],
      [
        { k: 'Height', v: this.fmtMetricCm(raw.heightCm) },
        { k: 'Weight', v: this.fmtMetricKg(raw.weightKg) },
      ],
    ];

    const metaHtml = metaRows
      .map(
        (pair) => `
      <div class="meta-row">
        ${pair
          .map(
            (cell) => `
          <div class="meta-cell">
            <span class="meta-k">${this.escape(cell.k)}</span>
            <span class="meta-v">${this.escape(cell.v)}</span>
          </div>`,
          )
          .join('')}
      </div>`,
      )
      .join('');

    const metaHtmlFull = `${opdClinicRow}${metaHtml}`;

    const barcodeBlock = barcodeImg
      ? `<div class="barcode-wrap"><img src="${this.escapeAttr(barcodeImg)}" alt="Visit barcode" class="barcode-img" /></div>`
      : `<div class="barcode-wrap muted">Barcode unavailable</div>`;

    const printedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${this.escape(formTitle)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      @media print {
        .notes-shell { break-inside: auto; }
        .letterhead, .form-title-bar, .form-sub { break-inside: avoid; page-break-inside: avoid; }
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        max-width: 100%;
        overflow-x: hidden;
      }
      body {
        padding: 10px 14px 18px;
        font-family: 'Times New Roman', Times, serif;
        color: #0f172a;
        font-size: 11.5pt;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .sheet {
        max-width: 210mm;
        width: 100%;
        margin: 0 auto;
        overflow-x: hidden;
      }
      .letterhead {
        display: flex;
        align-items: center;
        gap: 14px;
        border-bottom: 2px solid #0f172a;
        padding-bottom: 10px;
        margin-bottom: 10px;
        min-width: 0;
      }
      .logo {
        width: 56px;
        height: 56px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .brand {
        flex: 1;
        min-width: 0;
        text-align: center;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .brand-l1 { font-size: 13.5pt; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
      .brand-l2 { font-size: 10.5pt; margin-top: 2px; color: #334155; }
      .form-title-bar {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        width: 100%;
        margin: 10px 0 4px;
        page-break-after: avoid;
        break-after: avoid;
      }
      .form-title {
        margin: 0;
        font-size: 13pt;
        font-weight: 700;
        text-align: left;
        text-decoration: underline;
        text-underline-offset: 3px;
        overflow-wrap: anywhere;
        flex: 1 1 auto;
        min-width: 0;
      }
      .form-printed-at {
        margin: 0;
        font-size: 10pt;
        font-weight: 600;
        color: #475569;
        white-space: nowrap;
        flex-shrink: 0;
        text-align: right;
      }
      .form-sub { text-align: center; font-size: 9.5pt; color: #475569; margin: 0 0 10px; overflow-wrap: anywhere; }
      .meta {
        border: 1px solid #94a3b8;
        padding: 8px 10px;
        max-width: 100%;
        overflow-x: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .meta-row { display: flex; gap: 8px; margin-bottom: 6px; min-width: 0; }
      .meta-row:last-child { margin-bottom: 0; }
      .meta-row--single .meta-cell {
        flex: 1 1 100%;
        min-width: 0;
      }
      .meta-cell {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
        align-items: baseline;
      }
      .meta-k { font-weight: 700; min-width: 7.5em; flex-shrink: 0; }
      .meta-v {
        flex: 1;
        min-width: 0;
        border-bottom: 1px solid #cbd5e1;
        min-height: 1.15em;
        padding: 0 2px 1px;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .barcode-wrap { text-align: center; margin-top: 10px; max-width: 100%; overflow-x: auto; }
      .barcode-img { max-width: 100%; height: auto; display: inline-block; }
      .muted { color: #64748b; font-style: italic; font-size: 10pt; }
      .notes-shell {
        margin-top: 12px;
        border: 1px solid #475569;
        background: #fff;
        max-width: 100%;
        overflow-x: hidden;
      }
      /* Typed clinical notes: no ruled background (Quill + print/PDF never align grid lines). */
      .notes-html {
        position: relative;
        z-index: 1;
        padding: 8px 10px 12px;
        margin-bottom: 2px;
        border-bottom: 1px solid #e2e8f0;
        font-family: 'Times New Roman', Times, serif;
        font-size: 11pt;
        line-height: 1.45;
        max-width: 100%;
        overflow-x: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        hyphens: auto;
      }
      .notes-html p {
        margin: 0 0 0.45em;
        max-width: 100%;
      }
      .notes-html li {
        margin: 0.1em 0;
        max-width: 100%;
      }
      .notes-html h1,
      .notes-html h2,
      .notes-html h3,
      .notes-html h4,
      .notes-html h5,
      .notes-html h6 {
        max-width: 100%;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.25;
        margin: 0.35em 0 0.25em;
      }
      .notes-html ul,
      .notes-html ol {
        margin: 0.2em 0 0.5em 1.15em;
        padding: 0;
        max-width: 100%;
      }
      .notes-html ul ul,
      .notes-html ol ol {
        margin-bottom: 0;
      }
      .notes-html strong,
      .notes-html b {
        font-weight: 700;
      }
      .notes-html blockquote {
        margin: 0.35em 0 0.5em 0.5em;
        padding: 0.15em 0 0.15em 0.55em;
        border-left: 3px solid #94a3b8;
      }
      .notes-html img, .notes-html video, .notes-html svg {
        max-width: 100% !important;
        height: auto !important;
      }
      .notes-html table {
        width: 100% !important;
        max-width: 100% !important;
        table-layout: fixed;
        border-collapse: collapse;
        word-wrap: break-word;
      }
      .notes-html td, .notes-html th {
        overflow-wrap: anywhere;
        word-break: break-word;
        vertical-align: top;
        padding: 3px 4px;
        border: 1px solid #e2e8f0;
      }
      .notes-html pre {
        white-space: pre-wrap;
        word-break: break-word;
        max-width: 100%;
        margin: 0.35em 0;
        padding: 6pt 8pt;
        font-size: 9.5pt;
        line-height: 1.4;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 2px;
      }
      .notes-html code {
        white-space: pre-wrap;
        word-break: break-word;
      }
      /* Handwriting / continuation area only — empty box, ruled lines render correctly */
      .ruled {
        min-height: 10rem;
        margin: 0 6px 8px;
        padding-top: 4px;
        border-top: 1px solid #94a3b8;
        background-color: #fff;
        background-image: repeating-linear-gradient(
          to bottom,
          transparent 0,
          transparent calc(1.35em - 1px),
          #cbd5e1 calc(1.35em - 1px),
          #cbd5e1 1.35em
        );
        background-size: 100% 1.35em;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <header class="letterhead">
        <img class="logo" src="${this.escapeAttr(logoSrc)}" alt="" onerror="this.style.display='none'" />
        <div class="brand">
          <div class="brand-l1">${this.escape(instituteLine1)}</div>
          <div class="brand-l2">${this.escape(instituteLine2)}</div>
        </div>
      </header>
      <div class="form-title-bar">
        <h1 class="form-title">${this.escape(formTitle)}</h1>
        <p class="form-printed-at">${this.escape(printedAt)}</p>
      </div>
      <p class="form-sub">${this.escape(formSubtitle)}</p>
      <div class="meta">
        ${metaHtmlFull}
        ${barcodeBlock}
      </div>
      <section class="notes-shell" aria-label="Clinical notes">
        <div class="notes-html">${notesEmpty ? '' : notesSafe}</div>
        <div class="ruled" aria-hidden="true"></div>
      </section>
    </div>
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

  /** SIUT-style lab request form (doctor / OPD). */
  printLabRequestForm(raw: LabRequestFormInput): void {
    const popup = window.open('', '_blank', 'width=900,height=1100');
    if (!popup) return;
    const logoSrc = `${window.location.origin}${REGISTRATION_SLIP_BRAND.slipLogoPath}`;
    const lab = LAB_REQUEST_FORM;
    const qr =
      raw.qrDataUrl && raw.qrDataUrl.startsWith('data:image/')
        ? `<div class="lab-qr"><img src="${this.escapeAttr(raw.qrDataUrl)}" alt="" width="96" height="96" /><span>Scan to verify</span></div>`
        : '';

    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${this.escape(lab.title)}</title>
  <style>
    @page { size: A4; margin: 11mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; }
    .lab-sheet { max-width: 190mm; margin: 0 auto; padding-bottom: 12px; }
    .lab-head { display: grid; grid-template-columns: 72px 1fr 120px; gap: 10px; align-items: start; margin-bottom: 10px; }
    .lab-logo { width: 64px; height: 64px; object-fit: contain; }
    .lab-center { text-align: center; }
    .lab-caps { font-weight: 700; letter-spacing: 0.03em; line-height: 1.25; }
    .lab-l1 { font-size: 11pt; }
    .lab-l2 { font-size: 11pt; margin-top: 2px; }
    .lab-main-title { font-size: 13pt; font-weight: 700; margin-top: 8px; text-decoration: underline; }
    .lab-right { text-align: right; }
    .lab-siut { font-size: 22pt; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
    .lab-no { font-size: 11pt; font-weight: 700; margin-top: 6px; }
    .lab-row { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .lab-row--split .lab-field { flex: 1; min-width: 120px; }
    .lab-field { flex: 1; min-width: 0; }
    .lab-label { font-weight: 700; font-size: 10.5pt; }
    .lab-line { border-bottom: 1px solid #000; min-height: 1.15em; margin-top: 2px; padding: 0 2px 1px; word-break: break-word; }
    .lab-line--tests { min-height: 16rem; white-space: pre-wrap; font-weight: 400; }
    .lab-opd { margin-bottom: 10px; }
    .lab-foot { margin-top: 14px; display: flex; align-items: flex-end; gap: 8px; }
    .lab-foot .lab-label { white-space: nowrap; }
    .lab-foot .lab-line { flex: 1; }
    .lab-qr { margin-top: 14px; padding-top: 12px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 8pt; color: #334155; }
    .lab-qr img { display: block; margin: 0 auto 4px; }
    .lab-qr span { display: block; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="lab-sheet">
    <header class="lab-head">
      <img class="lab-logo" src="${this.escapeAttr(logoSrc)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="lab-center">
        <div class="lab-caps lab-l1">${this.escape(lab.instituteLine1)}</div>
        <div class="lab-caps lab-l2">${this.escape(lab.instituteLine2)}</div>
        <div class="lab-main-title">${this.escape(lab.title)}</div>
      </div>
      <div class="lab-right">
        <div class="lab-siut">SIUT</div>
        <div class="lab-no">No-${this.escape(raw.formNumber)}</div>
      </div>
    </header>
    <div class="lab-row lab-row--split">
      <div class="lab-field"><span class="lab-label">Name</span><div class="lab-line">${this.escape(raw.patientName)}</div></div>
      <div class="lab-field" style="flex:0 0 100px;max-width:120px"><span class="lab-label">Age</span><div class="lab-line">${this.escape(raw.ageLabel)}</div></div>
    </div>
    <div class="lab-row">
      <div class="lab-field" style="flex:0 0 22%"><span class="lab-label">No.</span><div class="lab-line">${this.escape(raw.visitNo)}</div></div>
      <div class="lab-field" style="flex:1"><span class="lab-label">Location</span><div class="lab-line">${this.escape(raw.locationLine)}</div></div>
      <div class="lab-field" style="flex:0 0 28%"><span class="lab-label">Date</span><div class="lab-line">${this.escape(raw.dateLine)}</div></div>
    </div>
    <div class="lab-opd">
      <span class="lab-label">OPD / Clinic</span>
      <div class="lab-line">${this.escape(raw.opdClinicLine)}</div>
    </div>
    <div style="margin-top:10px">
      <span class="lab-label">Tests:</span>
      <div class="lab-line lab-line--tests">${this.escape(raw.testsPlain)}</div>
    </div>
    <div class="lab-foot">
      <span class="lab-label">Name of Doctor:</span>
      <div class="lab-line">${this.escape(raw.requestingDoctor)}</div>
    </div>
    ${qr}
  </div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body>
</html>`);
    popup.document.close();
  }

  /** SIUT-style radiology request form (doctor / OPD), landscape A4. */
  printRadiologyRequestForm(raw: RadiologyRequestFormInput): void {
    const popup = window.open('', '_blank', 'width=1120,height=820');
    if (!popup) return;
    const logoSrc = `${window.location.origin}${REGISTRATION_SLIP_BRAND.slipLogoPath}`;
    const rad = RADIOLOGY_REQUEST_FORM;
    const deptCells = rad.departments
      .map(
        (d) =>
          `<div class="rad-dept-cell"><span class="rad-dept-label">${this.escape(d)}</span><span class="rad-dept-box"></span></div>`,
      )
      .join('');
    const transport = rad.transportOptions
      .map(
        (t) =>
          `<label class="rad-trans"><span class="rad-cb"></span>${this.escape(t)}</label>`,
      )
      .join('');
    const qr =
      raw.qrDataUrl && raw.qrDataUrl.startsWith('data:image/')
        ? `<div class="rad-qr"><img src="${this.escapeAttr(raw.qrDataUrl)}" alt="" width="96" height="96" /><span>Scan to verify</span></div>`
        : '';

    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${this.escape(rad.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 9mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #000; }
    .rad-sheet { width: 100%; max-width: 277mm; margin: 0 auto; padding-bottom: 12px; }
    .rad-top { display: grid; grid-template-columns: 76px 1fr 200px; gap: 8px; align-items: start; margin-bottom: 6px; }
    .rad-logo { width: 64px; height: 64px; object-fit: contain; }
    .rad-inst { text-align: center; font-weight: 700; font-size: 10pt; letter-spacing: 0.02em; line-height: 1.2; padding-top: 4px; }
    .rad-patient-stack { display: flex; flex-direction: column; gap: 6px; }
    .rad-name-box { border: 2px solid #000; min-height: 52px; padding: 4px 6px; }
    .rad-name-box .lbl { font-weight: 700; font-size: 8.5pt; }
    .rad-mini-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .rad-mini { border: 2px solid #000; min-height: 36px; padding: 3px 5px; }
    .rad-mini .lbl { font-weight: 700; font-size: 8pt; display: block; }
    .rad-mini .val { border-bottom: 1px solid #000; min-height: 1em; margin-top: 2px; font-size: 9.5pt; }
    .rad-title { text-align: center; font-size: 12.5pt; font-weight: 800; margin: 4px 0 6px; }
    .rad-no { font-size: 10pt; font-weight: 700; margin-top: 4px; }
    .rad-dept-row { display: grid; grid-template-columns: repeat(9, 1fr); gap: 0; border: 2px solid #000; margin-bottom: 6px; }
    .rad-dept-cell { border-right: 1px solid #000; padding: 4px 3px; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between; }
    .rad-dept-cell:last-child { border-right: 0; }
    .rad-dept-label { font-size: 7.5pt; font-weight: 700; text-align: center; line-height: 1.1; }
    .rad-dept-box { border: 1px solid #94a3b8; min-height: 18px; margin-top: 4px; }
    .rad-cols { display: grid; grid-template-columns: 62% 38%; gap: 0; border: 2px solid #000; min-height: 240px; }
    .rad-col { border-right: 1px solid #000; padding: 5px 6px; display: flex; flex-direction: column; }
    .rad-col:last-child { border-right: 0; }
    .rad-col-h { font-weight: 700; font-size: 9pt; margin-bottom: 4px; }
    .rad-col-body { flex: 1; white-space: pre-wrap; word-break: break-word; line-height: 1.35; border: 1px solid #cbd5e1; padding: 4px; min-height: 200px; }
    .rad-trans-grid { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .rad-trans { display: flex; align-items: center; gap: 6px; font-size: 8.5pt; font-weight: 600; }
    .rad-cb { width: 11px; height: 11px; border: 2px solid #000; flex-shrink: 0; display: inline-block; }
    .rad-footer { display: grid; grid-template-columns: 1fr 1fr; border: 2px solid #000; margin-top: 6px; min-height: 36px; }
    .rad-footer > div { padding: 6px 8px; border-right: 1px solid #000; }
    .rad-footer > div:last-child { border-right: 0; }
    .rad-footer .lbl { font-weight: 700; }
    .rad-footer .val { border-bottom: 1px solid #000; min-height: 1.1em; margin-top: 4px; }
    .rad-qr { margin-top: 10px; padding-top: 10px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 8pt; color: #334155; }
    .rad-qr img { display: block; margin: 0 auto 4px; }
    .rad-qr span { display: block; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="rad-sheet">
    <div class="rad-top">
      <div>
        <img class="rad-logo" src="${this.escapeAttr(logoSrc)}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="rad-no">No. ${this.escape(raw.formNumber)}</div>
      </div>
      <div class="rad-inst">${this.escape(rad.instituteLine)}</div>
      <div class="rad-patient-stack">
        <div class="rad-name-box">
          <span class="lbl">Name</span>
          <div class="val" style="border-bottom:1px solid #000;margin-top:4px;min-height:1.2em;font-weight:600">${this.escape(raw.patientName)}</div>
        </div>
        <div class="rad-mini-row">
          <div class="rad-mini"><span class="lbl">Age</span><div class="val">${this.escape(raw.ageLabel)}</div></div>
          <div class="rad-mini"><span class="lbl">Sex</span><div class="val">${this.escape(raw.sexLabel)}</div></div>
          <div class="rad-mini"><span class="lbl">Bed No.</span><div class="val">${this.escape(raw.bedNo)}</div></div>
        </div>
      </div>
    </div>
    <div class="rad-title">${this.escape(rad.title)}</div>
    <div class="rad-dept-row">${deptCells}</div>
    <div class="rad-cols">
      <div class="rad-col">
        <div class="rad-col-h">Examination/s Requested</div>
        <div class="rad-col-body">${this.escape(raw.examinationsPlain)}</div>
      </div>
      <div class="rad-col">
        <div class="rad-col-h">TRANSPORTATION</div>
        <div class="rad-trans-grid">${transport}</div>
        <div class="rad-col-body" style="min-height:140px;margin-top:8px;flex:1"></div>
      </div>
    </div>
    <div class="rad-footer">
      <div><span class="lbl">Requesting:</span><div class="val">${this.escape(raw.requestingDoctor)}</div></div>
      <div><span class="lbl">Date Requested:</span><div class="val">${this.escape(raw.dateRequested)}</div></div>
    </div>
    ${qr}
  </div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body>
</html>`);
    popup.document.close();
  }

  /** Strip HTML to plain text for investigation form fields. */
  htmlToPlainText(html: string | null | undefined, maxLen = 6000): string {
    if (!html) return "";
    let s = String(html)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length > maxLen) s = s.slice(0, maxLen) + "…";
    return s;
  }

  private fmtText(v: string | null | undefined): string {
    const s = String(v ?? '').trim();
    return s || '—';
  }

  private fmtMetricCm(v: number | string | null | undefined): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? `${n} cm` : '—';
  }

  private fmtMetricKg(v: number | string | null | undefined): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? `${n} kg` : '—';
  }

  private isEffectivelyEmptyHtml(html: string | null | undefined): boolean {
    if (!html) return true;
    const stripped = html
      .replace(/<\s*br\s*\/?>/gi, '')
      .replace(/<\s*\/\s*p\s*>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .trim();
    return stripped.length === 0;
  }

  /** Remove script handlers and executable URLs before injecting into print HTML. */
  private sanitizeNotesForPrint(html: string | null | undefined): string {
    if (!html) return '';
    let s = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/javascript:/gi, '');
    /* Quill / pasted HTML sometimes uses nowrap — blocks wrapping in print/PDF */
    s = s.replace(/white-space\s*:\s*nowrap/gi, 'white-space:normal');
    /* Default white paragraph backgrounds hide ruled lines in print */
    s = s.replace(
      /background-color:\s*(#fff|#ffffff|rgba?\(\s*255\s*,\s*255\s*,\s*255(?:\s*,\s*1)?\s*\)|white)\s*;?/gi,
      "",
    );
    s = s.replace(/\sstyle="\s*"/gi, "");
    return s;
  }

  private async visitBarcodePngDataUrl(hex: string | null | undefined): Promise<string | null> {
    const code = String(hex ?? '').trim();
    if (!code) return null;
    try {
      const JsBarcode = (await import('jsbarcode')).default;
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, code, {
        format: 'CODE128',
        width: 2,
        height: 56,
        displayValue: true,
        margin: 8,
        background: '#ffffff',
        lineColor: '#0f172a',
      });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** For attribute values (e.g. img src data URLs). */
  private escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
