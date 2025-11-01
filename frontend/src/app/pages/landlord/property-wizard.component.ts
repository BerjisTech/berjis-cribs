import { NgClass, NgIf } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { buildPropertyPayload } from "./property-form.utils";

@Component({
  selector: "app-property-wizard",
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgClass],
  templateUrl: "./property-wizard.component.html",
  styleUrl: "./property-wizard.component.css",
})
export class PropertyWizardComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private cribs = inject(CribsService);

  readonly form = this.fb.group({
    name: ["", Validators.required],
    description: ["", Validators.required],
    addressType: ["simple", Validators.required],
    address: this.fb.group({
      city: [""],
      estate: [""],
      street: [""],
    }),
    location: this.fb.group({
      lat: [null],
      lng: [null],
    }),
    details: this.fb.group({
      occupancyModes: ["nightly,monthly"],
      baseRates: [""],
      amenities: [""],
    }),
    policies: this.fb.group({
      cancellation: [""],
      houseRules: [""],
    }),
  });

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  async create() {
    if (this.form.invalid) {
      this.error.set("Fill all required fields before continuing.");
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const raw = this.form.getRawValue();
      const payload = buildPropertyPayload(raw);
      const property = await firstValueFrom(this.cribs.createProperty(payload));
      await this.router.navigate(["/landlord/properties", property.id]);
    } catch (error: any) {
      console.error("create property failed", error);
      this.error.set(error?.message || "Unable to create property");
    } finally {
      this.saving.set(false);
    }
  }
}
