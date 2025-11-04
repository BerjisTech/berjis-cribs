import { NgFor, NgIf, NgClass } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { ReactiveFormsModule, FormBuilder } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { Property } from "../../shared/models";

@Component({
  selector: "app-admin-properties",
  standalone: true,
  imports: [NgFor, NgIf, NgClass, ReactiveFormsModule],
  templateUrl: "./admin-properties.component.html",
  styleUrl: "./admin-properties.component.css",
})
export class AdminPropertiesComponent {
  private cribs = inject(CribsService);
  private fb = inject(FormBuilder);

  readonly statuses = [
    { key: "pending_review", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];
  readonly selectedStatus = signal("pending_review");
  readonly properties = signal<Property[]>([]);
  readonly loading = signal(true);

  readonly notesForm = this.fb.group({ notes: [""], reason: [""] });

  constructor() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    const list = await firstValueFrom(this.cribs.adminListProperties(this.selectedStatus()));
    this.properties.set(list);
    this.loading.set(false);
  }

  async switchStatus(status: string) {
    this.selectedStatus.set(status);
    await this.load();
  }

  async approve(property: Property) {
    const notes = this.notesForm.value.notes || "";
    await firstValueFrom(this.cribs.adminApproveProperty(property.id, notes));
    await this.load();
    this.notesForm.reset();
  }

  async reject(property: Property) {
    const reason = (this.notesForm.value.reason || "").trim();
    if (!reason) return;
    await firstValueFrom(this.cribs.adminRejectProperty(property.id, reason));
    await this.load();
    this.notesForm.reset();
  }
}
