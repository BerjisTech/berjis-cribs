import { Component, Input } from "@angular/core";
import { NgFor, NgIf, NgClass } from "@angular/common";

type UnitItem = { id: string; doorNumber: string; status?: string; floor?: number | null; block?: string };

@Component({
  selector: 'app-property-unit-map',
  standalone: true,
  imports: [NgFor, NgIf, NgClass],
  template: `
  <div class="space-y-3">
    <!-- Block tabs when applicable -->
    <div *ngIf="blockLabels.length > 1 || (blockLabels.length===1 && blockLabels[0] !== '')" class="flex flex-wrap gap-2">
      <button type="button" class="pill px-3 py-1 text-xs"
        [ngClass]="{ 'bg-white/10 border-white/20 text-white': activeBlock==='ALL' }"
        (click)="setActiveBlock('ALL')">All blocks</button>
      <button *ngFor="let b of blockLabels" type="button" class="pill px-3 py-1 text-xs"
        [ngClass]="{ 'bg-white/10 border-white/20 text-white': activeBlock===b }"
        (click)="setActiveBlock(b)">{{ b || '—' }}</button>
    </div>

    <!-- Phase sub-tabs when a single block selected and phases exist -->
    <div *ngIf="activeBlock!=='ALL' && phaseLabels(activeBlock).length > 0" class="flex flex-wrap gap-2">
      <button type="button" class="pill px-3 py-1 text-xs"
        [ngClass]="{ 'bg-white/10 border-white/20 text-white': activePhase==='ALL' }"
        (click)="setActivePhase('ALL')">All phases</button>
      <button *ngFor="let p of phaseLabels(activeBlock)" type="button" class="pill px-3 py-1 text-xs"
        [ngClass]="{ 'bg-white/10 border-white/20 text-white': activePhase===p }"
        (click)="setActivePhase(p)">{{ p || '—' }}</button>
    </div>

    <!-- Aggregate view when showing all blocks -->
    <ng-container *ngIf="activeBlock === 'ALL'; else focusedBlock">
      <div *ngIf="items.length === 0" class="text-sm text-slate-500">No units yet. Use "Generate units" to scaffold.</div>
      <div *ngFor="let block of allBlockLabels; trackBy: trackBlock" class="border rounded-xl p-4 space-y-3">
        <div class="text-sm font-semibold text-slate-500">{{ formatBlockLabel(block) }}</div>
        <ng-container *ngIf="blockHasPhases(block); else blockWithoutPhases">
          <div *ngFor="let phase of phaseLabels(block); trackBy: trackPhase" class="space-y-3">
            <div class="text-xs uppercase tracking-widest text-slate-500">{{ formatPhaseLabel(phase) }}</div>
            <div *ngIf="floorsForBlock(block, phase).length === 0" class="text-xs text-slate-500">No units assigned yet.</div>
            <div *ngFor="let f of floorsForBlock(block, phase); trackBy: trackFloorValue" class="border rounded-lg p-3">
              <div class="text-xs uppercase tracking-widest text-slate-500">{{ formatFloorLabel(f) }}</div>
              <div class="mt-2 grid gap-2" [style.gridTemplateColumns]="gridCols">
                <button *ngFor="let u of unitsForBlock(block, phase, f)"
                  class="rounded-md border px-3 py-2 text-sm"
                  [ngClass]="classes(u)"
                  [title]="tooltip(u)"
                  (click)="toggle(u)">{{ u.doorNumber }}</button>
              </div>
            </div>
          </div>
        </ng-container>
        <ng-template #blockWithoutPhases>
          <div *ngIf="floorsForBlock(block).length === 0" class="text-xs text-slate-500">No units assigned yet.</div>
          <div *ngFor="let f of floorsForBlock(block); trackBy: trackFloorValue" class="border rounded-lg p-3">
            <div class="text-xs uppercase tracking-widest text-slate-500">{{ formatFloorLabel(f) }}</div>
            <div class="mt-2 grid gap-2" [style.gridTemplateColumns]="gridCols">
              <button *ngFor="let u of unitsForBlock(block, null, f)"
                class="rounded-md border px-3 py-2 text-sm"
                [ngClass]="classes(u)"
                [title]="tooltip(u)"
                (click)="toggle(u)">{{ u.doorNumber }}</button>
            </div>
          </div>
        </ng-template>
      </div>
    </ng-container>

    <!-- Focused view for a specific block/phase -->
    <ng-template #focusedBlock>
      <div *ngIf="floors.length === 0" class="text-sm text-slate-500">No units yet. Use "Generate units" to scaffold.</div>
      <div *ngFor="let f of floors; trackBy: trackFloor" class="border rounded-xl p-3">
        <div class="text-xs uppercase tracking-widest text-slate-500">{{ formatFloorLabel(f) }}</div>
        <div class="mt-2 grid gap-2" [style.gridTemplateColumns]="gridCols">
          <button *ngFor="let u of unitsOnFloor(f)"
            class="rounded-md border px-3 py-2 text-sm"
            [ngClass]="classes(u)"
            [title]="tooltip(u)"
            (click)="toggle(u)">{{ u.doorNumber }}</button>
        </div>
      </div>
    </ng-template>
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

  activeBlock: string = 'ALL';
  activePhase: string = 'ALL';

  get blockLabels(): string[] {
    const set = new Set<string>();
    for (const u of this.items) set.add((u.block || '').toString());
    const list = Array.from(set.values());
    if (list.length === 1 && list[0] === '') return [];
    return list.sort();
  }

  get allBlockLabels(): string[] {
    if (!this.items || this.items.length === 0) {
      return [];
    }
    const set = new Set<string>();
    for (const u of this.items) {
      set.add((u.block ?? '').toString());
    }
    const list = Array.from(set.values()).sort((a, b) => a.localeCompare(b));
    const hasEmpty = list.includes('');
    if (hasEmpty) {
      const idx = list.indexOf('');
      list.splice(idx, 1);
      list.unshift('');
    }
    return list;
  }

  blockHasPhases(block: string): boolean {
    return this.phaseLabels(block).length > 0;
  }

  floorsForBlock(block: string, phase?: string): number[] {
    const targetBlock = (block ?? '').toString();
    const filterPhase = phase == null ? undefined : (phase ?? '').toString();
    const set = new Set<number>();
    for (const u of this.items) {
      const uBlock = (u.block ?? '').toString();
      if (uBlock !== targetBlock) continue;
      if (filterPhase !== undefined) {
        const uPhase = ((u as any).phase ?? '').toString();
        if (uPhase !== filterPhase) continue;
      }
      const floor = u.floor;
      if (floor === null || floor === undefined) continue;
      set.add(floor);
    }
    return Array.from(set.values()).sort((a, b) => a - b);
  }

  unitsForBlock(block: string, phase: string | null | undefined, floor: number): UnitItem[] {
    const targetBlock = (block ?? '').toString();
    const filterPhase = phase == null ? undefined : (phase ?? '').toString();
    const result = this.items.filter((u) => {
      const uBlock = (u.block ?? '').toString();
      if (uBlock !== targetBlock) return false;
      const uFloor = u.floor ?? null;
      if (uFloor !== floor) return false;
      if (filterPhase !== undefined) {
        const uPhase = ((u as any).phase ?? '').toString();
        if (uPhase !== filterPhase) return false;
      }
      return true;
    });
    return result.sort((a, b) => (a.doorNumber || '').localeCompare(b.doorNumber || ''));
  }

  formatBlockLabel(block: string): string {
    return block ? `Block ${block}` : 'Building';
  }

  formatPhaseLabel(phase: string): string {
    return phase ? `Phase ${phase}` : 'Phase —';
  }

  formatFloorLabel(floor: number): string {
    return floor === 0 ? 'Floor G' : `Floor ${floor}`;
  }

  phaseLabels(block: string): string[] {
    const set = new Set<string>();
    for (const u of this.items) {
      if ((u.block || '') === block) set.add(((u as any).phase || '').toString());
    }
    const list = Array.from(set.values());
    if (list.length === 1 && list[0] === '') return [];
    return list.sort();
  }

  setActiveBlock(b: string) { this.activeBlock = b; this.activePhase = 'ALL'; }
  setActivePhase(p: string) { this.activePhase = p; }

  get floors(): number[] {
    const set = new Set<number>();
    for (const u of this.filteredItems()) {
      const f = (u.floor ?? null);
      if (f === null || f === undefined) continue;
      set.add(f);
    }
    return Array.from(set.values()).sort((a, b) => a - b);
  }

  unitsOnFloor(f: number) {
    return this.filteredItems().filter(u => (u.floor ?? null) === f);
  }

  private filteredItems(): UnitItem[] {
    return this.items.filter(u => {
      const byBlock = (this.activeBlock === 'ALL') || ((u.block || '') === this.activeBlock);
      const byPhase = (this.activeBlock === 'ALL' || this.activePhase === 'ALL') || ((((u as any).phase || '')) === this.activePhase);
      return byBlock && byPhase;
    });
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
    const parts = [u.doorNumber, (u.status || 'available')];
    if (u.block) parts.push(`Block ${u.block}`);
    const phase = ((u as any).phase ?? '').toString();
    if (phase) parts.push(`Phase ${phase}`);
    if (u.floor !== null && u.floor !== undefined) {
      parts.push(this.formatFloorLabel(u.floor));
    }
    return parts.join(' · ');
  }

  trackFloor(_i: number, f: number) { return f; }
  trackBlock(_i: number, block: string) { return block || 'NO_BLOCK'; }
  trackPhase(_i: number, phase: string) { return phase || 'NO_PHASE'; }
  trackFloorValue(_i: number, floor: number) { return floor; }
}
