import { Pipe, PipeTransform } from '@angular/core';

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

const WORKFLOW = new Set([
  'booked',
  'registered',
  'ready',
  'batched',
  'dispatched',
  'completed',
  'skipped',
  'cancelled',
]);

/** Shared class strings for appointment / visit workflow states. */
export function workflowStatusBadgeClass(status: string | null | undefined): string {
  const k = norm(status);
  if (!k) return 'badge badge--muted';
  if (WORKFLOW.has(k)) return `badge badge--${k}`;
  if (k === 'ordered' || k === 'pending') return 'badge badge--booked';
  if (k === 'journey_completed' || status?.toLowerCase().includes('journey')) {
    return 'badge badge--completed';
  }
  return 'badge badge--muted';
}

/** Active / inactive / suspended (users, entities, etc.). */
export function entityStatusBadgeClass(status: string | null | undefined): string {
  const k = norm(status);
  if (k === 'active') return 'badge badge--entity-active';
  if (k === 'inactive') return 'badge badge--entity-inactive';
  if (k === 'suspended') return 'badge badge--entity-suspended';
  return 'badge badge--muted';
}

@Pipe({
  name: 'workflowStatusBadge',
  standalone: true,
})
export class WorkflowStatusBadgePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return workflowStatusBadgeClass(value);
  }
}

@Pipe({
  name: 'entityStatusBadge',
  standalone: true,
})
export class EntityStatusBadgePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return entityStatusBadgeClass(value);
  }
}
