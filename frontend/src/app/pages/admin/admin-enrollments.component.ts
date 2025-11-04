import { NgFor, NgIf, NgClass, DatePipe } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, FormGroup } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { LandlordEnrollment } from "../../shared/models";

@Component({
  selector: "app-admin-enrollments",
  standalone: true,
  imports: [NgFor, NgIf, NgClass, DatePipe, ReactiveFormsModule],
  templateUrl: "./admin-enrollments.component.html",
  styleUrl: "./admin-enrollments.component.css",
})
export class AdminEnrollmentsComponent {
  private fb = inject(FormBuilder);
  private cribs = inject(CribsService);

  readonly statuses = [
    { key: "submitted", label: "Incoming" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  readonly selectedStatus = signal("submitted");
  readonly enrollments = signal<LandlordEnrollment[]>([]);
  readonly loading = signal(true);
  private reviewForms = new Map<string, FormGroup>();

  private makeForm(seed?: Partial<{displayName:string;supportEmail:string;supportPhone:string;notes:string;reason:string}>) {
    return this.fb.group({
      displayName: [seed?.displayName ?? ""],
      supportEmail: [seed?.supportEmail ?? ""],
      supportPhone: [seed?.supportPhone ?? ""],
      notes: [seed?.notes ?? ""],
      reason: [seed?.reason ?? ""],
    });
  }

  formFor(e: LandlordEnrollment): FormGroup {
    const key = e.id;
    if (!this.reviewForms.has(key)) {
      this.reviewForms.set(key, this.makeForm({
        displayName: e.contactName || undefined,
        supportEmail: e.contactEmail || undefined,
        supportPhone: e.contactPhone || undefined,
      }));
    }
    return this.reviewForms.get(key)!;
  }

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    const status = this.selectedStatus();
    try {
      const list = await firstValueFrom(this.cribs.adminListEnrollments(status));
      this.enrollments.set(list);
      // reset dangling forms for items not in the new list
      const keep = new Set(list.map(i => i.id));
      for (const k of Array.from(this.reviewForms.keys())) {
        if (!keep.has(k)) this.reviewForms.delete(k);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async switchStatus(status: string) {
    this.selectedStatus.set(status);
    await this.load();
  }

  async approve(enrollment: LandlordEnrollment) {
    const value = this.formFor(enrollment).value as any;
    await firstValueFrom(
      this.cribs.adminApproveEnrollment(enrollment.id, {
        displayName: value.displayName || enrollment.contactName || "",
        supportEmail: value.supportEmail || enrollment.contactEmail || "",
        supportPhone: value.supportPhone || enrollment.contactPhone || "",
        notes: value.notes || "",
      })
    );
    await this.load();
    this.reviewForms.delete(enrollment.id);
  }

  async reject(enrollment: LandlordEnrollment) {
    const reason = (this.formFor(enrollment).value as any).reason?.trim();
    if (!reason) return;
    await firstValueFrom(this.cribs.adminRejectEnrollment(enrollment.id, reason));
    await this.load();
    this.reviewForms.delete(enrollment.id);
  }
}
