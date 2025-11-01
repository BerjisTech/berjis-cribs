import { NgFor, NgIf } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { LandlordEnrollment } from "../../shared/models";

@Component({
  selector: "app-admin-enrollments",
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule],
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
  readonly reviewForm = this.fb.group({
    displayName: [""],
    supportEmail: [""],
    supportPhone: [""],
    notes: [""],
    reason: [""],
  });

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    const status = this.selectedStatus();
    try {
      const list = await firstValueFrom(this.cribs.adminListEnrollments(status));
      this.enrollments.set(list);
    } finally {
      this.loading.set(false);
    }
  }

  async switchStatus(status: string) {
    this.selectedStatus.set(status);
    await this.load();
  }

  async approve(enrollment: LandlordEnrollment) {
    const value = this.reviewForm.value;
    await firstValueFrom(
      this.cribs.adminApproveEnrollment(enrollment.id, {
        displayName: value.displayName || enrollment.contactName || "",
        supportEmail: value.supportEmail || enrollment.contactEmail || "",
        supportPhone: value.supportPhone || enrollment.contactPhone || "",
        notes: value.notes || "",
      })
    );
    await this.load();
    this.reviewForm.reset();
  }

  async reject(enrollment: LandlordEnrollment) {
    const reason = this.reviewForm.value.reason?.trim();
    if (!reason) return;
    await firstValueFrom(this.cribs.adminRejectEnrollment(enrollment.id, reason));
    await this.load();
    this.reviewForm.reset();
  }
}
