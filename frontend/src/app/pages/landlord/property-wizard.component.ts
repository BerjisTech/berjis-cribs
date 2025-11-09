import { NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, AfterViewInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { buildPropertyPayload } from "./property-form.utils";
import { environment } from "../../../environments/environment";
import * as mapboxgl from 'mapbox-gl';
import { NumberingEditorComponent } from './numbering-editor.component';
import { KNOWN_AMENITIES } from '../../shared/amenities';
import { NumberingConfig, generatePreview } from './numbering-preview.util';

@Component({
  selector: "app-property-wizard",
  standalone: true,
  imports: [ReactiveFormsModule, NgIf, NgFor, NgClass, NumberingEditorComponent],
  templateUrl: "./property-wizard.component.html",
  styleUrl: "./property-wizard.component.css",
})
export class PropertyWizardComponent implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cribs = inject(CribsService);
  private map: any = null;
  private marker: any = null;

  readonly step = signal(0);
  private editId: string | null = null;
  // Structured editor state for wizard: per-block per-floor counts
  structuredCountsWizard: number[][] = [];
  blocksForWizard(): string[] {
    const num = this.form.get('numbering')!.value as any;
    const labelsCsv = (num?.blockLabels || '').toString().trim();
    if (labelsCsv) {
      return labelsCsv.split(',').map((s: string) => s.trim()).filter((s: string) => s);
    }
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
      formattedAddress: [""]
    }),
    details: this.fb.group({
      occupancyMode: ["monthly"],
      baseRateAmount: [null as number | null],
      baseRateFrequency: ["monthly"],
      amenities: this.fb.control<string[] | null>([]),
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
      hasBlocks: [false],
      blocksCount: [1],
      blockNaming: ["letters"], // letters | numbers | custom
      blockDigits: [1],
      blockPrefix: [""],
      blockLabels: [""],
      floorNaming: ["prefix"], // prefix | plain
      floorLabelKind: ['numeric'], // numeric | alpha (UI: how floors are named visually)
      phasedBlocks: [false], // legacy
      hasPhases: [false],
      phaseSides: [2], // if phasedBlocks, how many sides (A/B)
      phaseNaming: ['letters'], // letters | numbers
      phaseDigits: [1],
      labelingMode: ['floor'], // 'floor' | 'sequential'
      groundStyle: ['g'], // 'g' | '00'
      sequenceKind: ['numeric'], // 'numeric' | 'alpha'
      floorDoorKind: ['numeric'], // 'numeric' | 'alpha'
      floorDigits: [1],
      phasesList: [''],
      doorScheme: ['floor_numeric'], // simple_numeric | simple_alpha | floor_numeric | floor_alpha
      floorThreeDigit: [true], // when floor_numeric: 101 vs 11 (legacy)
      doorDigits: [2],
    })
  });

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly mapError = signal<string | null>(null);
  readonly knownAmenities = KNOWN_AMENITIES;

  // Template helpers to keep AOT-safe expressions
  get numberingVal(): any { return this.form.get('numbering')?.value || {}; }
  get addressTypeVal(): string { return this.form.get('addressType')?.value || 'simple'; }
  get showBlockControls(): boolean { const t = this.addressTypeVal; return !!this.numberingVal?.hasBlocks || t === 'block' || t === 'hybrid'; }
  get showCustomPrefix(): boolean { return this.showBlockControls && (this.numberingVal?.blockNaming === 'custom'); }
  get showPhases(): boolean { return this.showBlockControls && ( !!this.numberingVal?.hasPhases || !!this.numberingVal?.phasedBlocks || !!(this.numberingVal?.phasesList||'').trim()); }
  get unitSlots(): any[] { const n = Math.max(1, Number(this.numberingVal?.unitsPerFloor || 1)); return Array.from({ length: n }); }
  get isSequential(): boolean { return ((this.numberingVal?.labelingMode || 'floor') === 'sequential'); }
  get isFloorMode(): boolean { return ((this.numberingVal?.labelingMode || 'floor') === 'floor'); }
  get isFloorNumeric(): boolean {
    const scheme = (this.numberingVal?.doorScheme || '').toString();
    return scheme === 'floor_numeric';
  }
  get canSaveDraft(): boolean {
    const name = String(this.form.get('name')?.value || '').trim();
    const loc = this.form.get('location')?.value as any;
    const lngOk = loc && (loc.lng !== null && loc.lng !== undefined && String(loc.lng).trim() !== '');
    const addrOk = loc && String(loc.formattedAddress || '').trim().length > 0;
    return !!name && !!lngOk && !!addrOk && !this.saving();
  }

  // City search state
  readonly cityQuery = signal("");
  readonly cityOptions = signal<Array<{ label: string; center: [number, number]; context?: any }>>([]);
  readonly cityOpen = signal(false);
  private cityAbort?: AbortController;

ngOnInit() {
    // Map picker (basic)
    setTimeout(() => this.ensureMap(), 0);
    // Recompute preview when relevant fields change
    const num = this.form.get('numbering');
    const addrType = this.form.get('addressType');
    if (addrType) {
      addrType.valueChanges.subscribe((v: any) => {
        const mode = String(v || 'simple');
        const cur = (this.form.get('numbering')?.value as any)?.labelingMode;
        if (mode === 'simple' && cur !== 'sequential') {
          this.form.get('numbering.labelingMode')?.setValue('sequential', { emitEvent: false } as any);
        }
        if ((mode === 'floor' || mode === 'block' || mode === 'hybrid') && cur === 'sequential') {
          this.form.get('numbering.labelingMode')?.setValue('floor', { emitEvent: false } as any);
        }
        if (mode === 'simple') this.ensureMap();
      });
    }
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId = id;
      this.loadDraft(id);
    }
  }

  private async loadDraft(id: string) {
    try {
      const p = await firstValueFrom(this.cribs.getProperty(id));
      if (p) {
        this.form.patchValue({
          name: p.name || '',
          description: p.description || '',
          addressType: p.addressType || 'simple',
          address: (p.address || {} as any),
          location: (p.location || {} as any),
          details: this.mapDetailsForForm(p),
          policies: (p.policies || {} as any),
        } as any);
        // Load numbering config from details.numbering if present
        const num = (p.details as any)?.numbering;
        if (num && typeof num === 'object') {
          this.form.get('numbering')?.patchValue(num);
        }
      }
    } catch {}
  }

  ngAfterViewInit() {
    // Ensure map is created when DOM is ready
    this.ensureMap();
  }

  // Amenities selection helper
  toggleAmenity(a: string, checked: boolean) {
    const ctrl = this.form.get('details.amenities');
    const cur = ((ctrl?.value as any) || []) as string[];
    if (checked) {
      if (!cur.includes(a)) ctrl?.setValue([...(cur || []), a]);
    } else {
      ctrl?.setValue((cur || []).filter(x => x !== a));
    }
  }

  next() { this.step.update(s => Math.min(s + 1, 2)); }
  prev() { this.step.update(s => Math.max(s - 1, 0)); setTimeout(() => { if (this.step() === 0) this.ensureMap(); }, 0); }

  // Expose edit mode to template
  get isEditing() { return !!this.editId; }

  async deleteProperty() {
    if (!this.editId) return;
    if (!confirm('Delete this property? All units, media, leases, and payments will be removed.')) return;
    try {
      this.saving.set(true);
      await firstValueFrom(this.cribs.deleteProperty(this.editId));
      await this.router.navigate(["/landlord"]);
    } finally {
      this.saving.set(false);
    }
  }

  private async ensureMap() {
    this.mapError.set(null);
    try {
      const el = document.getElementById('map-picker');
      if (!el) return;
      // dynamic import to avoid bundling issues
      const mapboxModule = await import('mapbox-gl');
      const mgl: any = (mapboxModule as any).default ?? mapboxModule;
      const token = environment.mapboxToken || (window as any).__MAPBOX_TOKEN__ || '';
      if (!token) {
        this.mapError.set('Missing Mapbox token.');
        return;
      }
      mgl.accessToken = token;
      if (this.map) {
        try {
          if (this.map.getContainer && this.map.getContainer() !== el) {
            this.map.remove();
            this.map = null;
          } else {
            this.map.resize();
            return;
          }
        } catch {}
      }
      const style = environment.mapStyle || (document.documentElement.classList.contains('dark') ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12');
      const m = new mgl.Map({ container: el, style, center: [36.8219, -1.2921], zoom: 11, cooperativeGestures: true });
      this.map = m;
      const marker = new mgl.Marker({ draggable: true });
      const setPos = (lng: number, lat: number) => {
        marker.setLngLat([lng, lat]).addTo(m);
        this.form.patchValue({ location: { lat: lat as any, lng: lng as any } });
        this.reverseGeocode(lng, lat);
      };
      m.on('load', () => setTimeout(() => m.resize(), 50));
      m.on('error', (e: any) => { try { if (e?.error?.message) this.mapError.set(e.error.message); } catch {} });
      m.on('click', (e: any) => setPos(e.lngLat.lng, e.lngLat.lat));
      marker.on('dragend', () => { const p = marker.getLngLat(); setPos(p.lng, p.lat); });
      this.marker = marker;
    } catch (err: any) {
      this.mapError.set(err?.message || 'Unable to initialize map');
    }
  }

  // Forward geocode for City/Town field
  async searchCity(query: string) {
    const q = (query || '').trim();
    if (q.length < 2) { this.cityOptions.set([]); return; }
    try {
      this.cityAbort?.abort();
      this.cityAbort = new AbortController();
      const token = encodeURIComponent(environment.mapboxToken || '');
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&types=place,locality,neighborhood,region&limit=6&access_token=${token}`;
      const res = await fetch(url, { signal: this.cityAbort.signal });
      const json = await res.json();
      const opts = (json?.features || []).map((f: any) => ({ label: f.place_name || f.text, center: f.center as [number, number], context: f.context }));
      this.cityOptions.set(opts);
    } catch {}
  }
  onCityInput(v: string) { this.cityQuery.set(v); this.cityOpen.set(true); this.searchCity(v); }
  onCityFocus() { this.cityOpen.set(true); if ((this.cityOptions() || []).length === 0) this.searchCity(this.cityQuery()); }
  onCityBlur() { setTimeout(() => this.cityOpen.set(false), 120); }
  selectCity(opt: { label: string; center: [number, number] }) {
    this.form.patchValue({ address: { city: opt.label } });
    const [lng, lat] = opt.center;
    if (this.map && this.marker) {
      this.marker.setLngLat([lng, lat]).addTo(this.map);
      this.map.flyTo({ center: [lng, lat], zoom: Math.max(this.map.getZoom(), 13) });
    }
    this.form.patchValue({ location: { lat: lat as any, lng: lng as any, formattedAddress: opt.label } });
    this.cityOpen.set(false);
  }

  // Reverse geocode map clicks to autofill City/Town
  async reverseGeocode(lng: number, lat: number) {
    try {
      const token = encodeURIComponent(environment.mapboxToken || '');
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,region,neighborhood&limit=1&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      const label = (json?.features?.[0]?.place_name || json?.features?.[0]?.text || '').toString();
      if (label.trim()) {
        this.form.patchValue({ address: { city: label }, location: { formattedAddress: label } });
      } else {
        this.form.patchValue({ location: { formattedAddress: `${lat}, ${lng}` } });
      }
    } catch {}
  }


  async create(saveOnly = false) {
    if (saveOnly) {
      const name = String(this.form.get('name')?.value || '').trim();
      const loc = this.form.get('location')?.value as any;
      const lngOk = loc && (loc.lng !== null && loc.lng !== undefined && String(loc.lng).trim() !== '');
      if (!name || !lngOk) {
        this.error.set('Draft requires a name and location. Click the map to set coordinates.');
        return;
      }
    } else {
      if (this.form.invalid) {
        this.error.set("Fill all required fields before continuing.");
        return;
      }
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const raw = this.form.getRawValue();
      const payload = buildPropertyPayload(raw);
      let propertyId: string;
      if (this.editId) {
        await firstValueFrom(this.cribs.updateProperty(this.editId, payload));
        propertyId = this.editId;
      } else {
        const created = await firstValueFrom(this.cribs.createProperty(payload));
        propertyId = (created as any).id;
      }
      // Optionally auto-generate units from numbering using the same preview generator
      if (!saveOnly) {
        const v: any = raw.numbering || {};
        const addr = (raw.addressType || 'floor') as any;
        const hasBlocks = !!v.hasBlocks || !!(v.blockLabels || '').toString().trim();
        const hasPhases = !!v.hasPhases || !!(v.phasesList || '').toString().trim();
        const effectiveAddress: 'simple' | 'block' | 'floor' | 'hybrid' | 'standalone' = (hasBlocks || hasPhases) ? 'hybrid' : addr;
        const cfg: NumberingConfig = {
          addressType: effectiveAddress,
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
          blockLabelsCsv: (v.blockLabels || ''),
          hasPhases: !!v.hasPhases || !!(v.phasesList || '').toString().trim(),
          phaseSides: Number(v.phaseSides || 1),
          phaseNaming: (v.phaseNaming || 'letters'),
          phasesListCsv: (v.phasesList || ''),
          blockDigits: Number(v.blockDigits || 1),
          phaseDigits: Number(v.phaseDigits || 1),
          floorDigits: Number(v.floorDigits || 1),
          doorDigits: Number(v.doorDigits || (v.floorThreeDigit ? 2 : 1)),
        };
        const unitsPerFloor = Math.max(1, Number(v.unitsPerFloor || 1));
        const blocks = generatePreview(cfg, unitsPerFloor);
        // Translate preview into unit payloads
        const unitsPayload: any[] = [];
        for (const block of blocks) {
          for (const f of block.floors) {
            if (!block.sides) {
              const cells = f.cells as string[];
              cells.forEach((door, idx) => {
                unitsPayload.push({
                  id: '',
                  addressType: effectiveAddress,
                  block: (block.label || '').toString().toUpperCase(),
                  phase: '',
                  floor: f.idx,
                  doorNumber: door,
                  status: 'available',
                });
              });
            } else {
              const sided = f.cells as string[][];
              sided.forEach((sideCells, sideIdx) => {
                sideCells.forEach((door) => {
                  unitsPayload.push({
                    id: '',
                    addressType: effectiveAddress,
                    block: (block.label || '').toString().toUpperCase(),
                    phase: (block.sides?.[sideIdx] || '').toString().toUpperCase(),
                    floor: f.idx,
                    doorNumber: door,
                    status: 'available',
                  });
                });
              });
            }
          }
        }
        if (unitsPayload.length > 0) {
          await firstValueFrom(this.cribs.upsertUnits(propertyId, unitsPayload));
        }
      }
      await this.router.navigate(["/landlord/properties", propertyId]);
    } catch (error: any) {
      console.error("create property failed", error);
      const msg = (error && (error.error?.message || error.message)) || "Unable to create property";
      this.error.set(String(msg));
    } finally {
      this.saving.set(false);
    }
  }

  private mapDetailsForForm(p: any) {
    const occ = Array.isArray(p?.details?.occupancyModes) && p.details.occupancyModes.length > 0
      ? p.details.occupancyModes[0]
      : (typeof p?.details?.occupancyModes === 'string' ? p.details.occupancyModes : 'monthly');
    const base = (p?.details?.baseRates || '').toString();
    let baseAmount: number | null = null;
    let baseFreq = 'monthly';
    if (base) {
      const m = base.match(/([0-9]+(?:\.[0-9]+)?)\s*(hour|night|daily|day|week|weekly|month|monthly|year|yearly)/i);
      if (m) {
        baseAmount = Number(m[1]);
        baseFreq = (m[2] || 'monthly').toLowerCase();
        if (baseFreq === 'day') baseFreq = 'daily';
        if (baseFreq === 'week') baseFreq = 'weekly';
        if (baseFreq === 'month') baseFreq = 'monthly';
        if (baseFreq === 'year') baseFreq = 'yearly';
      }
    }
    const amenities = Array.isArray(p?.amenities) ? p.amenities : [];
    return {
      occupancyMode: occ,
      baseRateAmount: baseAmount,
      baseRateFrequency: baseFreq,
      amenities,
    } as any;
  }
}
