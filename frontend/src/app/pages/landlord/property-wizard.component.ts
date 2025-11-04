import { NgClass, NgIf } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { buildPropertyPayload } from "./property-form.utils";
import { environment } from "../../../environments/environment";
import * as mapboxgl from 'mapbox-gl';

@Component({
  selector: "app-property-wizard",
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgClass],
  templateUrl: "./property-wizard.component.html",
  styleUrl: "./property-wizard.component.css",
})
export class PropertyWizardComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private cribs = inject(CribsService);

  readonly step = signal(0);
  // Structured editor state for wizard: per-block per-floor counts
  structuredCountsWizard: number[][] = [];
  blocksForWizard(): string[] {
    const num = this.form.get('numbering')!.value as any;
    const count = Math.max(1, Number(num?.blocksCount || 1));
    const naming = (num?.blockNaming || 'letters').toString();
    const prefix = (num?.blockPrefix || '').toString().trim();
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      if (naming === 'numbers') out.push(String(i + 1));
      else if (naming === 'custom') out.push(prefix || `Block ${i + 1}`);
      else out.push(String.fromCharCode('A'.charCodeAt(0) + i));
    }
    // ensure counts matrix sized
    const floors = Math.max(1, Number(num?.floors || 1)) + (num?.includeGround ? 1 : 0);
    while (this.structuredCountsWizard.length < out.length) this.structuredCountsWizard.push(Array(floors).fill(Number(num?.unitsPerFloor || 1)));
    this.structuredCountsWizard = this.structuredCountsWizard.slice(0, out.length).map(arr => arr.slice(0, floors).concat(Array(Math.max(0, floors - arr.length)).fill(Number(num?.unitsPerFloor || 1))));
    return out;
  }
  setWizardCount(bi: number, fi: number, v: number) {
    if (!this.structuredCountsWizard[bi]) this.structuredCountsWizard[bi] = [];
    this.structuredCountsWizard[bi][fi] = (isNaN(v) || v < 0) ? 0 : v;
  }
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
    numbering: this.fb.group({
      simpleSeries: ["numbers"], // numbers | letters
      floors: [1],
      includeGround: [true],
      unitsPerFloor: [1],
      blocksCount: [1],
      blockNaming: ["letters"], // letters | numbers | custom
      blockPrefix: [""],
      floorNaming: ["prefix"], // prefix | plain
    })
  });

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    // Map picker (basic)
    setTimeout(() => {
      try {
        (window as any).mapboxgl = (mapboxgl as any);
        (window as any).mapboxgl.accessToken = environment.mapboxToken;
        const el = document.getElementById('map-picker');
        if (!el) return;
        const m = new mapboxgl.Map({
          container: el,
          style: document.documentElement.classList.contains('dark') ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
          center: [36.8219, -1.2921], zoom: 11
        });
        const marker = new mapboxgl.Marker({ draggable: true });
        const setPos = (lng: number, lat: number) => {
          marker.setLngLat([lng, lat]).addTo(m);
          this.form.patchValue({ location: { lat: lat as any, lng: lng as any } });
        };
        m.on('click', (e: any) => setPos(e.lngLat.lng, e.lngLat.lat));
        marker.on('dragend', () => {
          const p = marker.getLngLat(); setPos(p.lng, p.lat);
        });
      } catch {}
    }, 0);
  }

  next() { this.step.update(s => Math.min(s + 1, 2)); }
  prev() { this.step.update(s => Math.max(s - 1, 0)); }

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
      // Optionally auto-generate units from numbering
      const num = raw.numbering || ({} as any);
      const addr = raw.addressType;
      const floors = Number((num as any).floors) || 1;
      const includeGround = !!(num as any).includeGround;
      const unitsPerFloor = Number((num as any).unitsPerFloor) || 1;
      if (floors > 0 && unitsPerFloor > 0) {
        const input: any = { addressType: addr, floors, includeGround, unitsPerFloor };
        if (addr === 'simple') {
          input.totalUnits = floors * unitsPerFloor * (includeGround ? (floors>0?floors:1) : floors);
        }
        // Structured counts
        const blocks = this.blocksForWizard();
        if (blocks.length > 0 && (addr === 'floor' || addr === 'hybrid' || addr === 'block')) {
          const map: any = {};
          blocks.forEach((b, bi) => { map[(b || '').toString().toUpperCase()] = (this.structuredCountsWizard[bi] || []).map(n => Number(n||0)); });
          input.perBlockPerFloor = map;
        } else if (addr === 'floor') {
          input.perFloorCounts = (this.structuredCountsWizard[0] || []).map(n => Number(n||0));
        }
        await firstValueFrom(this.cribs.generateUnits(property.id, input));
      }
      await this.router.navigate(["/landlord/properties", property.id]);
    } catch (error: any) {
      console.error("create property failed", error);
      this.error.set(error?.message || "Unable to create property");
    } finally {
      this.saving.set(false);
    }
  }
}
