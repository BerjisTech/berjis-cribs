import { AsyncPipe, NgClass, NgFor, NgIf, SlicePipe } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { Subject, firstValueFrom } from "rxjs";
import { debounceTime, distinctUntilChanged, takeUntil } from "rxjs/operators";
import { environment } from "../../../environments/environment";
import { CribsService } from "../../core/cribs.service";
import { SessionService } from "../../core/session.service";
import { PublicProperty } from "../../shared/models";

@Component({
  selector: "app-explore",
  standalone: true,
  imports: [NgFor, NgIf, NgClass, AsyncPipe, SlicePipe, ReactiveFormsModule, RouterLink],
  templateUrl: "./explore.component.html",
  styleUrl: "./explore.component.css",
})
export class ExploreComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private cribs = inject(CribsService);
  private session = inject(SessionService);

  readonly queryForm = this.fb.group({
    search: [""],
  });

  readonly properties = signal<PublicProperty[]>([]);
  readonly loading = signal(false);
  readonly selectedProperty = signal<PublicProperty | null>(null);
  readonly signInUrl = "https://berjis.tech/auth/login";
  readonly isAuthenticated = this.session.isAuthenticated;
  readonly canManageLandlord = this.session.canManageLandlord;
  readonly canAccessAdmin = this.session.canAccessAdmin;
  readonly showDashboardNav = computed(() => this.isAuthenticated());
  readonly showSignIn = computed(() => !this.isAuthenticated());
  readonly showLandlordCta = computed(() => !this.canManageLandlord());

  private map: any;
  private mapReady = false;
  private mapEventsAttached = false;
  private destroy$ = new Subject<void>();

  trackByPropertyId(_index: number, property: PublicProperty) {
    return property.id;
  }

  async ngOnInit() {
    await this.loadProperties();
    const searchControl = this.queryForm.get("search");
    if (searchControl) {
      searchControl.valueChanges
        .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
        .subscribe(async (val) => {
          await this.loadProperties(val ?? "");
        });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.map && this.map.remove) {
      this.map.remove();
    }
  }

  async onSearch() {
    await this.loadProperties(this.queryForm.value.search ?? "");
  }

  focusProperty(property: PublicProperty) {
    this.selectedProperty.set(property);
    if (this.map && property.location?.lng && property.location?.lat) {
      this.map.flyTo({
        center: [property.location.lng, property.location.lat],
        zoom: Math.max(this.map.getZoom(), 13),
        speed: 0.7,
        curve: 1.2,
      });
      this.highlightPropertyOnMap(property.id);
    }
  }

  statusBadgeClasses(status?: string) {
    const normalized = (status || "available").toLowerCase();
    const styles: Record<string, string> = {
      available: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30",
      occupied: "bg-sky-500/15 text-sky-200 border border-sky-400/30",
      maintenance: "bg-amber-500/15 text-amber-200 border border-amber-400/30",
      reserved: "bg-orange-500/15 text-orange-200 border border-orange-400/30",
      inactive: "bg-slate-500/15 text-slate-300 border border-slate-400/30",
    };
    return styles[normalized] ?? styles["available"];
  }

  private async loadProperties(search: string = "") {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.cribs.getPublicProperties({ q: search, limit: 50 }));
      this.properties.set(list);
      await this.ensureMap(list);
      this.syncSelectedProperty(list);
    } catch (error) {
      console.error("failed to load properties", error);
    } finally {
      this.loading.set(false);
    }
  }

  private syncSelectedProperty(list: PublicProperty[]) {
    const current = this.selectedProperty();
    if (current) {
      const stillExists = list.some((p) => p.id === current.id);
      if (!stillExists) {
        this.selectedProperty.set(null);
        this.highlightPropertyOnMap(undefined);
      } else {
        this.highlightPropertyOnMap(current.id);
      }
    }
    if (!this.selectedProperty() && list.length > 0) {
      this.focusProperty(list[0]);
    }
  }

  private async ensureMap(list: PublicProperty[]) {
    try {
      const mapboxModule = await import("mapbox-gl");
      const mapboxgl: any = (mapboxModule as any).default ?? mapboxModule;
      mapboxgl.accessToken = environment.mapboxToken || (window as any).__MAPBOX_TOKEN__ || "";
      if (!mapboxgl.accessToken) {
        return;
      }
      if (!this.map) {
        this.map = new mapboxgl.Map({
          container: "cribs-map",
          style: environment.mapStyle,
          center: [36.8219, -1.2921],
          zoom: 11,
          cooperativeGestures: true,
          pitch: 30,
        });
        this.map.on("load", () => {
          this.mapReady = true;
          this.refreshMapData(list);
          this.attachMapInteractions();
        });
      }
      if (this.mapReady) {
        this.refreshMapData(list);
      } else if (this.map) {
        this.map.once("load", () => {
          this.mapReady = true;
          this.refreshMapData(list);
          this.attachMapInteractions();
        });
      }
    } catch (error) {
      console.warn("map setup failed", error);
    }
  }

  private refreshMapData(list: PublicProperty[]) {
    const map: any = this.map;
    if (!map) {
      return;
    }
    const features = list
      .filter((p) => p.location?.lng && p.location?.lat)
      .map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.location.lng, p.location.lat] },
        properties: {
          id: p.id,
          name: p.name,
          landlord: p.landlordName,
          status: (p.details?.status || "available").toLowerCase(),
        },
      }));
    const collection = { type: "FeatureCollection", features };
    if (map.getSource("cribs-source")) {
      (map.getSource("cribs-source") as any).setData(collection);
    } else {
      map.addSource("cribs-source", { type: "geojson", data: collection });
    }

    if (!map.getLayer("cribs-points")) {
      map.addLayer({
        id: "cribs-points",
        type: "circle",
        source: "cribs-source",
        paint: {
          "circle-radius": 9,
          "circle-color": [
            "match",
            ["get", "status"],
            "occupied",
            "#0ea5e9",
            "maintenance",
            "#facc15",
            "reserved",
            "#f97316",
            "inactive",
            "#94a3b8",
            "#22c55e",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#d4af37",
        },
      });
    }

    if (!map.getLayer("cribs-points-selected")) {
      map.addLayer({
        id: "cribs-points-selected",
        type: "circle",
        source: "cribs-source",
        paint: {
          "circle-radius": 14,
          "circle-color": "rgba(37, 99, 235, 0.18)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#d4af37",
        },
        filter: ["==", ["get", "id"], ""],
      });
    }

    this.highlightPropertyOnMap(this.selectedProperty()?.id ?? undefined);
  }

  private attachMapInteractions() {
    if (!this.map || this.mapEventsAttached) {
      return;
    }
    this.mapEventsAttached = true;
    this.map.on("click", "cribs-points", (event: any) => {
      const feature = event?.features?.[0];
      const propertyId = feature?.properties?.id;
      if (!propertyId) {
        return;
      }
      const match = this.properties().find((p) => p.id === propertyId);
      if (match) {
        this.focusProperty(match);
      }
    });

    this.map.on("mouseenter", "cribs-points", () => {
      this.map.getCanvas().style.cursor = "pointer";
    });
    this.map.on("mouseleave", "cribs-points", () => {
      this.map.getCanvas().style.cursor = "";
    });
  }

  private highlightPropertyOnMap(propertyId?: string) {
    if (!this.map || !this.mapReady || !this.map.getLayer("cribs-points-selected")) {
      return;
    }
    const filter = propertyId ? ["==", ["get", "id"], propertyId] : ["==", ["get", "id"], ""];
    this.map.setFilter("cribs-points-selected", filter as any);
  }
}
