import { DatePipe, CurrencyPipe, NgFor, NgIf } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Subject, firstValueFrom, takeUntil } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { TenantUnitDetail } from "../../shared/models";

@Component({
  selector: "app-tenant-crib",
  standalone: true,
  imports: [NgIf, NgFor, RouterLink, DatePipe, CurrencyPipe],
  templateUrl: "./tenant-crib.component.html",
  styleUrl: "./tenant-crib.component.css",
})
export class TenantCribComponent implements OnInit, OnDestroy {
  private cribs = inject(CribsService);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly crib = signal<TenantUnitDetail | null>(null);

  readonly landlordContact = computed(() => {
    const detail = this.crib();
    if (!detail) {
      return null;
    }
    return {
      name: detail.landlordName,
      phone: detail.supportPhone,
      email: detail.supportEmail,
    };
  });

  ngOnInit() {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(async (params) => {
      const id = params.get("id");
      if (!id) {
        this.error.set("Missing apartment identifier.");
        return;
      }
      await this.loadCrib(id);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadCrib(id: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.cribs.getTenantUnit(id));
      if (!data) {
        this.error.set("We could not find that unit. Confirm the link and try again.");
        this.crib.set(null);
        return;
      }
      this.crib.set(data);
    } catch (error: any) {
      console.error("failed to load unit", error);
      this.error.set("Unable to load this unit right now. Please try again later.");
      this.crib.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
