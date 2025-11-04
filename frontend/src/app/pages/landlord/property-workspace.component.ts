import { NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormArray, FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { Property, PropertyMedia, PropertyUnit } from "../../shared/models";
import { buildMediaPayload, buildPropertyPayload } from "./property-form.utils";
import { environment } from "../../../environments/environment";
import { PropertyUnitMapComponent } from "./property-unit-map.component";

@Component({
  selector: "app-property-workspace",
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, NgClass, PropertyUnitMapComponent],
  templateUrl: "./property-workspace.component.html",
  styleUrl: "./property-workspace.component.css",
})
export class PropertyWorkspaceComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private cribs = inject(CribsService);

  readonly property = signal<Property | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly mediaForm = this.fb.group({
    url: [""],
    kind: ["interior"],
    caption: [""],
  });
  readonly mediaRequired = signal(5);
  mapMulti = false;
  selectedIds: string[] = [];
  readonly environment = environment as any;

  readonly propertyForm = this.fb.group({
    name: [""],
    description: [""],
    addressType: [""],
    location: this.fb.group({ lat: [null], lng: [null] }),
    details: this.fb.group({ occupancyModes: [""], baseRates: [""], amenities: [""] }),
    policies: this.fb.group({ cancellation: [""], houseRules: [""] }),
  });

  readonly unitsForm = this.fb.array([]);
  readonly generateForm = this.fb.group({
    addressType: ["floor"],
    totalUnits: [16],
    blocks: ["A"],
    phases: [""],
    floors: [4],
    includeGround: [true],
    unitsPerFloor: [4],
    unitType: ["apartment"],
    defaultStatus: ["available"],
    perFloorCounts: [""],
    perBlockPerFloor: [""],
  });
  readonly selectedUnit = signal<PropertyUnit | null>(null);
  readonly selectedForm = this.fb.group({
    displayName: [""],
    doorNumber: [""],
    unitType: [""],
    status: ["available"],
    maintenanceNote: [""],
  });
  readonly selectedLease = signal<any | null>(null);
  readonly selectedLeasePayments = signal<any[]>([]);
  readonly addPaymentForm = this.fb.group({ amount: [0], method: [""], reference: [""], paidOn: [""] });
  readonly closeLeaseForm = this.fb.group({ endDate: [""], note: [""] });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get("id");
    if (id) {
      await this.load(id);
    }
  }

  get units(): FormArray {
    return this.unitsForm as FormArray;
  }

  private async load(id: string) {
    this.loading.set(true);
    try {
      const property = await firstValueFrom(this.cribs.getProperty(id));
      this.property.set(property);
      this.patchForms(property);
    } finally {
      this.loading.set(false);
    }
  }

  private patchForms(property: Property) {
    this.propertyForm.patchValue({
      name: property.name,
      description: property.description,
      addressType: property.addressType,
      location: { lat: property.location?.lat ?? null, lng: property.location?.lng ?? null },
      details: {
        occupancyModes: (property.details?.occupancyModes || []).join(","),
        baseRates: property.details?.baseRates || "",
        amenities: Array.isArray(property.amenities) ? property.amenities.join(",") : "",
      },
      policies: {
        cancellation: property.policies?.cancellation || "",
        houseRules: property.policies?.houseRules || "",
      },
    });
    this.units.clear();
    (property.units || []).forEach((unit) => this.units.push(this.createUnitGroup(unit)));
  }

  private createUnitGroup(unit?: PropertyUnit) {
    return this.fb.group({
      id: [unit?.id || ""],
      addressType: [unit?.addressType || "simple"],
      structureLabel: [unit?.structureLabel || ""],
      block: [unit?.block || ""],
      phase: [unit?.phase || ""],
      floor: [unit?.floor || null],
      doorNumber: [unit?.doorNumber || ""],
      displayName: [unit?.displayName || ""],
      unitType: [unit?.unitType || ""],
      status: [unit?.status || "draft"],
      maintenanceNote: [unit?.maintenanceNote || ""],
      metadata: [JSON.stringify(unit?.metadata || {}, null, 2)],
      pricing: [JSON.stringify(unit?.pricing || {}, null, 2)],
    });
  }

  addUnit() {
    this.units.push(this.createUnitGroup());
  }

  removeUnit(index: number) {
    this.units.removeAt(index);
  }

  async saveProperty() {
    if (!this.property()) return;
    this.saving.set(true);
    try {
      const raw = this.propertyForm.getRawValue();
      const payload = buildPropertyPayload(raw);
      await firstValueFrom(this.cribs.updateProperty(this.property()!.id, payload));
    } finally {
      this.saving.set(false);
    }
  }

  async saveUnits() {
    if (!this.property()) return;
    this.saving.set(true);
    try {
      const units = this.units.controls.map((control) => {
        const value = control.value;
        return {
          ...value,
          metadata: safeJsonParse(value.metadata),
          pricing: safeJsonParse(value.pricing),
        };
      });
      await firstValueFrom(this.cribs.upsertUnits(this.property()!.id, units));
      await this.load(this.property()!.id);
    } finally {
      this.saving.set(false);
    }
  }

  async addMedia() {
    if (!this.property()) return;
    const raw = this.mediaForm.getRawValue();
    const payload = buildMediaPayload(raw);
    if (!payload.url) {
      return;
    }
    const media = await firstValueFrom(this.cribs.addMedia(this.property()!.id, payload));
    this.property.update((current) => {
      if (!current) return current;
      const mediaList = current.media ? [...current.media, media] : [media];
      return { ...current, media: mediaList };
    });
    this.mediaForm.reset({ kind: "interior" });
  }

  async deleteMedia(media: PropertyMedia) {
    if (!this.property()) return;
    await firstValueFrom(this.cribs.deleteMedia(this.property()!.id, media.id));
    this.property.update((current) => {
      if (!current) return current;
      return { ...current, media: (current.media || []).filter((m) => m.id !== media.id) };
    });
  }

  async submitForReview() {
    if (!this.property()) return;
    const mediaCount = (this.property()?.media || []).length;
    if (mediaCount < this.mediaRequired()) {
      alert(`Please add at least ${this.mediaRequired()} photos before submitting for review.`);
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(this.cribs.submitProperty(this.property()!.id));
      await this.load(this.property()!.id);
    } finally {
      this.saving.set(false);
    }
  }

  async generateUnits() {
    if (!this.property()) return;
    const raw = this.generateForm.getRawValue();
    const payload: any = {
      addressType: (raw.addressType || 'floor') as any,
      totalUnits: Number(raw.totalUnits) || 0,
      blocks: (raw.blocks || '').toString().split(',').map((s: string) => s.trim()).filter((s: string) => s),
      phases: (raw.phases || '').toString().split(',').map((s: string) => s.trim()).filter((s: string) => s),
      floors: Number(raw.floors) || 0,
      includeGround: !!raw.includeGround,
      unitsPerFloor: Number(raw.unitsPerFloor) || 0,
      unitType: raw.unitType || 'apartment',
      defaultStatus: raw.defaultStatus || 'available',
    };
    // Per-floor counts
    const pfc = (raw as any).perFloorCounts?.toString().trim();
    if (pfc) {
      payload.perFloorCounts = pfc.split(',').map((x: string) => Number(x.trim())).filter((n: number) => !isNaN(n));
    }
    // Per-block per-floor shorthand "A:4,4,3; B:2,2,3"
    const pbpf = (raw as any).perBlockPerFloor?.toString().trim();
    if (pbpf) {
      const map: Record<string, number[]> = {};
      pbpf.split(';').forEach((entry: string) => {
        const [k, v] = entry.split(':');
        if (!k || !v) return;
        map[k.trim().toUpperCase()] = v.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      });
      payload.perBlockPerFloor = map;
    }
    await firstValueFrom(this.cribs.generateUnits(this.property()!.id, payload));
    await this.load(this.property()!.id);
  }

  onUnitSelect = (u: any) => {
    const p = this.property();
    if (!p) return;
    const found = (p.units || []).find(x => x.doorNumber === u.doorNumber && (x as any).floor === (u.floor ?? (x as any).floor) && ((x as any).block || '') === (u.block || '')) || null;
    this.selectedUnit.set(found as any);
    if (found) {
      this.selectedForm.reset({
        displayName: (found as any).displayName || '',
        doorNumber: (found as any).doorNumber || '',
        unitType: (found as any).unitType || '',
        status: (found as any).status || 'available',
        maintenanceNote: (found as any).maintenanceNote || '',
      });
      // load lease for this unit (if any)
      this.loadSelectedLease(found.id);
    }
  };

  private async loadSelectedLease(unitId: string) {
    try {
      const leases = await firstValueFrom(this.cribs.listLeases());
      const match = (leases || []).find((l: any) => l.unit_id === unitId && (l.status || '').toLowerCase() !== 'ended');
      this.selectedLease.set(match || null);
      if (match?.id) {
        const pays = await firstValueFrom(this.cribs.getLeasePayments(match.id));
        this.selectedLeasePayments.set(pays || []);
      } else {
        this.selectedLeasePayments.set([]);
      }
    } catch {
      this.selectedLease.set(null);
      this.selectedLeasePayments.set([]);
    }
  }

  readonly leaseCreateForm = this.fb.group({
    tenantUuid: [""],
    type: ["monthly"],
    startDate: [""],
    endDate: [""],
    rate: [0],
    frequency: ["monthly"],
    deposit: [0],
  });

  async createLeaseForSelected() {
    const u = this.selectedUnit();
    if (!u) return;
    const v = this.leaseCreateForm.getRawValue() as any;
    const payload = {
      unitId: u.id,
      tenantUuid: v.tenantUuid,
      type: v.type,
      status: 'active',
      startDate: v.startDate,
      endDate: v.endDate || undefined,
      rate: Number(v.rate) || 0,
      frequency: v.frequency,
      deposit: Number(v.deposit) || 0,
    };
    await firstValueFrom(this.cribs.createLease(payload));
    await this.loadSelectedLease(u.id);
  }

  async saveSelectedUnit() {
    const current = this.selectedUnit();
    if (!current || !this.property()) return;
    const v = this.selectedForm.getRawValue();
    const payload = [{
      id: current.id,
      addressType: (current as any).addressType,
      structureLabel: (current as any).structureLabel,
      block: (current as any).block,
      phase: (current as any).phase,
      floor: (current as any).floor,
      doorNumber: v.doorNumber,
      displayName: v.displayName,
      unitType: v.unitType,
      status: v.status,
      maintenanceNote: v.maintenanceNote,
      metadata: (current as any).metadata || {},
      pricing: (current as any).pricing || {},
    }];
    await firstValueFrom(this.cribs.upsertUnits(this.property()!.id, payload as any));
    await this.load(this.property()!.id);
    const updated = (this.property()!.units || []).find(u => u.id === current.id) || null;
    this.selectedUnit.set(updated || null);
  }

  async bulkSetStatus(status: string) {
    if (!this.property() || this.selectedIds.length === 0) return;
    const units = (this.property()!.units || []).filter(u => this.selectedIds.includes(u.id)).map(u => ({
      id: u.id,
      addressType: (u as any).addressType,
      structureLabel: (u as any).structureLabel,
      block: (u as any).block,
      phase: (u as any).phase,
      floor: (u as any).floor,
      doorNumber: (u as any).doorNumber,
      displayName: (u as any).displayName,
      unitType: (u as any).unitType,
      status,
      maintenanceNote: (u as any).maintenanceNote,
      metadata: (u as any).metadata || {},
      pricing: (u as any).pricing || {},
    }));
    await firstValueFrom(this.cribs.upsertUnits(this.property()!.id, units as any));
    await this.load(this.property()!.id);
    this.selectedIds = [];
  }

  async addPaymentForLease() {
    const lease = this.selectedLease();
    if (!lease) return;
    const v = this.addPaymentForm.getRawValue() as any;
    const payload = {
      amount: Number(v.amount) || 0,
      method: v.method || undefined,
      reference: v.reference || undefined,
      paidOn: v.paidOn || undefined,
    };
    await firstValueFrom(this.cribs.addPayment(lease.id || lease.ID || lease.id, payload));
    await this.loadSelectedLease(this.selectedUnit()?.id || "");
    this.addPaymentForm.reset({ amount: 0, method: "", reference: "", paidOn: "" });
  }
  downloadLeasePaymentsCsv() {
    const rows = this.selectedLeasePayments();
    const header = ['Date','Amount','Method','Reference','Receipt No'];
    const body = rows.map((r:any)=>[
      (r.paidOn||r.paid_on)||'',
      r.amount||0,
      r.method||'',
      r.reference||r.reference?.String||'',
      r.receiptNo||r.receipt_no||''
    ]);
    const csv = [header].concat(body).map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'lease-payments.csv'; a.click(); URL.revokeObjectURL(url);
  }

  async closeLease() {
    const lease = this.selectedLease();
    if (!lease) return;
    const v = this.closeLeaseForm.getRawValue() as any;
    if (!confirm('Close this lease? This will set status to ended.')) return;
    await firstValueFrom(this.cribs.updateLease(lease.id || lease.ID || lease.id, { status: 'ended', endDate: v.endDate || undefined, note: v.note || undefined } as any));
    await this.loadSelectedLease(this.selectedUnit()?.id || "");
  }
  async reopenLease() {
    const lease = this.selectedLease();
    if (!lease) return;
    if (!confirm('Reopen this lease? This will set status to active.')) return;
    await firstValueFrom(this.cribs.updateLease(lease.id || lease.ID || lease.id, { status: 'active', endDate: undefined } as any));
    await this.loadSelectedLease(this.selectedUnit()?.id || "");
  }

  // Messaging composer
  showMessage = false;
  messageForm = this.fb.group({ subject: [""], body: [""], toUuid: [""] });
  openMessage(toUuid: string) { this.messageForm.patchValue({ toUuid }); this.showMessage = true; }
  closeMessage() { this.showMessage = false; }
  async sendMessage() {
    const v = this.messageForm.getRawValue() as any;
    await firstValueFrom(this.cribs.sendCoreMessage({ toUuid: v.toUuid, subject: v.subject || "Message from landlord", body: v.body || "" }));
    this.showMessage = false;
  }
}

function safeJsonParse(raw: any) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
