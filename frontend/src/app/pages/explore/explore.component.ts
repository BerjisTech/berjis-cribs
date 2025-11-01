import { AsyncPipe, NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { environment } from "../../../environments/environment";
import { CribsService } from "../../core/cribs.service";
import { PublicProperty } from "../../shared/models";

@Component({
  selector: "app-explore",
  standalone: true,
  imports: [NgFor, NgIf, NgClass, AsyncPipe, ReactiveFormsModule],
  templateUrl: "./explore.component.html",
  styleUrl: "./explore.component.css",
})
export class ExploreComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private cribs = inject(CribsService);

  readonly queryForm = this.fb.group({
    search: [""],
    mode: ["map" as "map" | "grid" | "both"],
  });

  readonly properties = signal<PublicProperty[]>([]);
  readonly loading = signal(false);
  readonly viewMode = computed(() => this.queryForm.value.mode ?? "map");

  private map: any;

  async ngOnInit() {
    await this.loadProperties();
    this.queryForm.valueChanges.subscribe(async (val) => {
      await this.loadProperties(val.search ?? "");
    });
  }

  ngOnDestroy() {
    if (this.map && this.map.remove) {
      this.map.remove();
    }
  }

  private async loadProperties(search: string = "") {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.cribs.getPublicProperties({ q: search, limit: 50 }));
      this.properties.set(list);
      if ((environment.mapboxToken || (window as any).__MAPBOX_TOKEN__) && this.viewMode() !== "grid") {
        await this.ensureMap(list);
      }
    } catch (error) {
      console.error("failed to load properties", error);
    } finally {
      this.loading.set(false);
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
        });
      }
      const map: any = this.map;
      while (map.getLayer("cribs-points")) {
        map.removeLayer("cribs-points");
      }
      while (map.getSource("cribs-source")) {
        map.removeSource("cribs-source");
      }
      const features = list
        .filter((p) => p.location?.lng && p.location?.lat)
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.location.lng, p.location.lat] },
          properties: { id: p.id, name: p.name, status: p.details?.status || "Available" },
        }));
      map.addSource("cribs-source", { type: "geojson", data: { type: "FeatureCollection", features } });
      map.addLayer({
        id: "cribs-points",
        type: "circle",
        source: "cribs-source",
        paint: {
          "circle-radius": 10,
          "circle-color": "#2563eb",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#d4af37",
        },
      });
    } catch (error) {
      console.warn("map setup failed", error);
    }
  }
}
