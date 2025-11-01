import { NgFor, NgIf } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { Property } from "../../shared/models";

@Component({
  selector: "app-landlord-dashboard",
  standalone: true,
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: "./landlord-dashboard.component.html",
  styleUrl: "./landlord-dashboard.component.css",
})
export class LandlordDashboardComponent implements OnInit {
  private cribs = inject(CribsService);
  readonly properties = signal<Property[]>([]);
  readonly loading = signal(true);

  readonly statusColours: Record<string, string> = {
    draft: "bg-slate-700 text-slate-100",
    pending_review: "bg-amber-500/20 text-amber-200",
    approved: "bg-emerald-500/20 text-emerald-200",
    rejected: "bg-red-500/20 text-red-200",
  };

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.cribs.listProperties());
      this.properties.set(list);
    } finally {
      this.loading.set(false);
    }
  }
}
