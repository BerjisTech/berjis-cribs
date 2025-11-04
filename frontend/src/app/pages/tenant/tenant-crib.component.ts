import { DatePipe, CurrencyPipe, NgFor, NgIf, TitleCasePipe } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Subject, firstValueFrom, takeUntil } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { TenantUnitDetail } from "../../shared/models";
import { PropertyUnitMapComponent } from "../landlord/property-unit-map.component";

@Component({
  selector: "app-tenant-crib",
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, CurrencyPipe, TitleCasePipe, PropertyUnitMapComponent],
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
  readonly leaseDetail = signal<any | null>(null);
  readonly leaseReceipts = signal<any[]>([]);
  downloadPaymentsCsv(rows: any[]) {
    const header = ['Date','Amount','Status','Method'];
    const body = (rows||[]).map((r:any)=>[
      r.paidOn||'', r.amount||0, r.status||'', r.method||''
    ]);
    const csv = [header].concat(body).map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'payments.csv'; a.click(); URL.revokeObjectURL(url);
  }
  downloadReceiptsCsv() {
    const rows = this.leaseReceipts();
    const header = ['Date','Amount','Method','Receipt No'];
    const body = rows.map((r:any)=>[
      (r.paidOn||r.paid_on)||'',
      r.amount||0,
      r.method||'',
      r.receiptNo||r.receipt_no||''
    ]);
    const csv = [header].concat(body).map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'receipts.csv'; a.click(); URL.revokeObjectURL(url);
  }
  readonly propertyUnits = signal<Array<{ id: string; doorNumber: string; status: string; floor?: number }>>([]);

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
      if (data.lease?.id) {
        try {
          const detail = await firstValueFrom(this.cribs.getTenantLease(data.lease.id));
          this.leaseDetail.set(detail?.lease || null);
          this.leaseReceipts.set(detail?.payments || []);
        } catch {
          this.leaseDetail.set(null);
          this.leaseReceipts.set([]);
        }
      } else {
        this.leaseDetail.set(null);
        this.leaseReceipts.set([]);
      }
      // Load occupancy map for the property (public)
      if ((data as any).propertyId) {
        try {
          const map = await firstValueFrom(this.cribs.getPublicUnitStatus((data as any).propertyId));
          this.propertyUnits.set(map as any);
        } catch {}
      } else {
        this.propertyUnits.set([]);
      }
    } catch (error: any) {
      console.error("failed to load unit", error);
      this.error.set("Unable to load this unit right now. Please try again later.");
      this.crib.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
