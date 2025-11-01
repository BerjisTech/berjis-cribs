import { NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormArray, FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { Property, PropertyMedia, PropertyUnit } from "../../shared/models";
import { buildMediaPayload, buildPropertyPayload } from "./property-form.utils";

@Component({
  selector: "app-property-workspace",
  standalone: true,
  imports: [ReactiveFormsModule, NgFor, NgIf, NgClass],
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

  readonly propertyForm = this.fb.group({
    name: [""],
    description: [""],
    addressType: [""],
    location: this.fb.group({ lat: [null], lng: [null] }),
    details: this.fb.group({ occupancyModes: [""], baseRates: [""], amenities: [""] }),
    policies: this.fb.group({ cancellation: [""], houseRules: [""] }),
  });

  readonly unitsForm = this.fb.array([]);

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
    this.saving.set(true);
    try {
      await firstValueFrom(this.cribs.submitProperty(this.property()!.id));
      await this.load(this.property()!.id);
    } finally {
      this.saving.set(false);
    }
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
