import { CurrencyPipe, DatePipe, NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { SessionService } from "../../core/session.service";
import { Property, TenantUnitSummary } from "../../shared/models";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [NgIf, NgFor, NgClass, RouterLink, DatePipe, CurrencyPipe],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.css",
})
export class DashboardComponent implements OnInit {
  private cribs = inject(CribsService);
  private session = inject(SessionService);

  readonly tenantUnits = signal<TenantUnitSummary[]>([]);
  readonly landlordProperties = signal<Property[]>([]);
  readonly loadingTenant = signal(false);
  readonly loadingLandlord = signal(false);
  readonly tenantError = signal<string | null>(null);
  readonly landlordError = signal<string | null>(null);

  readonly activeUnit = computed(() => this.tenantUnits()[0] ?? null);
  readonly canManageLandlord = this.session.canManageLandlord;

  async ngOnInit() {
    await this.session.ensure();
    await Promise.all([this.loadTenantUnits(), this.loadLandlordPortfolio()]);
  }

  private async loadTenantUnits() {
    this.loadingTenant.set(true);
    this.tenantError.set(null);
    try {
      const units = await firstValueFrom(this.cribs.getTenantUnits());
      this.tenantUnits.set(units);
    } catch (error: any) {
      console.error("failed to load tenant units", error);
      this.tenantError.set("We couldn't load your units right now. Please try again shortly.");
    } finally {
      this.loadingTenant.set(false);
    }
  }

  private async loadLandlordPortfolio() {
    if (!this.canManageLandlord()) {
      this.landlordProperties.set([]);
      this.landlordError.set(null);
      this.loadingLandlord.set(false);
      return;
    }
    this.loadingLandlord.set(true);
    this.landlordError.set(null);
    try {
      const properties = await firstValueFrom(this.cribs.listProperties());
      this.landlordProperties.set(properties);
    } catch (error: any) {
      if (error?.status === 403 || error?.status === 404) {
        this.landlordProperties.set([]);
      } else {
        console.error("failed to load landlord properties", error);
        this.landlordError.set("Portfolio data is unavailable at the moment.");
      }
    } finally {
      this.loadingLandlord.set(false);
    }
  }
}
