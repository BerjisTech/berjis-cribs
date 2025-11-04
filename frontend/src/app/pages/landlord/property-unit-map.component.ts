import { Component, Input } from "@angular/core";
import { NgFor, NgIf, NgClass } from "@angular/common";

type UnitItem = { id: string; doorNumber: string; status?: string; floor?: number | null; block?: string };

@Component({
  selector: 'app-property-unit-map',
  standalone: true,
  imports: [NgFor, NgIf, NgClass],
  template: `
  <div *ngIf="mode === 'floor'" class="space-y-3">
    <div *ngIf="floors.length === 0" class="text-sm text-slate-500">No units yet. Use "Generate units" to scaffold.</div>
    <div *ngFor="let f of floors; trackBy: trackFloor" class="border rounded-xl p-3">
      <div class="text-xs uppercase tracking-widest text-slate-500">Floor {{ f === 0 ? 'G' : f }}</div>
      <div class="mt-2 grid gap-2" [style.gridTemplateColumns]="gridCols">
        <button *ngFor="let u of unitsOnFloor(f)"
          class="rounded-md border px-3 py-2 text-sm"
          [ngClass]="classes(u)"
          (click)="toggle(u)">{{ u.doorNumber }}</button>
      </div>
    </div>
  </div>
  <div *ngIf="mode !== 'floor'" class="grid gap-2" [style.gridTemplateColumns]="gridCols">
    <button *ngFor="let u of items" class="rounded-md border px-3 py-2 text-sm" [title]="tooltip(u)" [ngClass]="classes(u)" (click)="toggle(u)">
      {{ u.doorNumber }}
    </button>
  </div>
  `,
})
export class PropertyUnitMapComponent {
  @Input() items: UnitItem[] = [];
  @Input() mode: 'simple' | 'block' | 'floor' | 'hybrid' | 'standalone' = 'simple';
  @Input() columns = 6;
  @Input() onSelect?: (unit: UnitItem) => void;
  @Input() multiSelect = false;
  @Input() selectedIds: string[] = [];

  get gridCols() { return `repeat(${this.columns}, minmax(0, 1fr))`; }

  get floors(): number[] {
    const set = new Set<number>();
    for (const u of this.items) {
      const f = (u.floor ?? null);
      if (f === null || f === undefined) continue;
      set.add(f);
    }
    return Array.from(set.values()).sort((a, b) => a - b);
  }

  unitsOnFloor(f: number) {
    return this.items.filter(u => (u.floor ?? null) === f);
  }

  statusClass(status?: string) {
    const s = (status || '').toLowerCase();
    if (s === 'occupied' || s === 'active') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200';
    if (s === 'maintenance') return 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-200';
    if (s === 'reserved') return 'border-orange-400/30 bg-orange-500/10 text-orange-700 dark:text-orange-200';
    return 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-800 dark:text-slate-200';
  }

  select(u: UnitItem) { this.onSelect?.(u); }

  classes(u: UnitItem) {
    const base = this.statusClass(u.status);
    const sel = this.selectedIds.includes(u.id) ? ' ring-2 ring-blue-500' : '';
    return base + sel;
  }

  toggle(u: UnitItem) {
    if (!this.multiSelect) { this.select(u); return; }
    const idx = this.selectedIds.indexOf(u.id);
    if (idx >= 0) this.selectedIds.splice(idx, 1); else this.selectedIds.push(u.id);
    this.selectedIds = [...this.selectedIds];
  }

  tooltip(u: UnitItem) {
    const st = (u.status || 'available');
    const floor = (u.floor ?? undefined);
    const floorLabel = (floor === undefined) ? '' : (floor === 0 ? ' · Floor G' : ` · Floor ${floor}`);
    return `${u.doorNumber} · ${st}${floorLabel}`;
  }

  trackFloor(_i: number, f: number) { return f; }
}
