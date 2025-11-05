import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { generatePreview, NumberingConfig } from './numbering-preview.util';

@Component({
  selector: 'app-numbering-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './numbering-editor.component.html',
  styleUrls: ['./numbering-editor.component.css'],
})
export class NumberingEditorComponent implements OnInit, OnDestroy {
  @Input() group!: FormGroup; // expects controls used below; safe-guarded in template
  @Input() showAddressing = false; // render addressType if present

  previewBlocks: Array<{ label: string; sides?: string[]; floors: Array<{ idx: number; label: string; cells: string[] | string[][] }> }> = [];
  private sub?: Subscription;

  get val(): any { return (this.group?.value ?? {}) as any; }
  get unitSlots(): any[] { const n = Math.max(1, Number(this.val?.unitsPerFloor || 1)); return Array.from({ length: n }); }

  ngOnInit(): void {
    this.render();
    if (this.group) {
      this.sub = this.group.valueChanges.subscribe(() => this.render());
    }
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private render() {
    if (!this.group) { this.previewBlocks = []; return; }
    const v: any = this.group.getRawValue();
    const addr = (v.addressType || 'floor') as any;
    const cfg: NumberingConfig = {
      addressType: addr,
      floors: Math.max(0, Number(v.floors || 0)),
      includeGround: !!v.includeGround,
      floorLabelKind: (v.floorLabelKind || 'numeric'),
      doorScheme: (v.doorScheme || 'floor_numeric'),
      floorThreeDigit: !!v.floorThreeDigit,
      groundStyle: (v.groundStyle || 'g'),
      hasBlocks: !!v.hasBlocks,
      blocksCount: Number(v.blocksCount || 1),
      blockNaming: (v.blockNaming || 'letters'),
      blockPrefix: (v.blockPrefix || ''),
      blockLabelsCsv: (v.blockLabels || v.blockLabelsCsv || ''),
      hasPhases: !!v.hasPhases || !!(v.phasesList || v.phasesListCsv || '').toString().trim(),
      phaseSides: Number(v.phaseSides || 1),
      phaseNaming: (v.phaseNaming || 'letters'),
      phasesListCsv: (v.phasesList || v.phasesListCsv || ''),
      blockDigits: Number(v.blockDigits || 1),
      phaseDigits: Number(v.phaseDigits || 1),
      floorDigits: Number(v.floorDigits || 1),
      doorDigits: Number(v.doorDigits || (v.floorThreeDigit ? 2 : 1)),
    };
    const unitsPerFloor = Math.max(1, Number(v.unitsPerFloor || 1));
    this.previewBlocks = generatePreview(cfg, unitsPerFloor);
  }
}

