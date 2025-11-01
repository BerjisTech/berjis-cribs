import { AsyncPipe, CommonModule, NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { LandlordEnrollment } from "../../shared/models";

interface StepDefinition {
  key: string;
  title: string;
  description: string;
  fields: { key: string; label: string; placeholder?: string; type?: string; helper?: string }[];
}

@Component({
  selector: "app-enrollment",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgFor, NgIf, NgClass, AsyncPipe],
  templateUrl: "./enrollment.component.html",
  styleUrl: "./enrollment.component.css",
})
export class EnrollmentComponent implements OnInit {
  private fb = inject(FormBuilder);
  private cribs = inject(CribsService);

  readonly steps: StepDefinition[] = [
    {
      key: "organization",
      title: "Organization Profile",
      description: "Tell us who you are onboarding and the nature of your housing portfolio.",
      fields: [
        { key: "legalName", label: "Registered name", placeholder: "Berjis Homes Ltd" },
        { key: "registrationNo", label: "Registration / KRA PIN" },
        { key: "entityType", label: "Entity type", helper: "Company, partnership, trust, sole proprietor…" },
        { key: "portfolioScale", label: "Units managed", helper: "Approximate number of active units" },
      ],
    },
    {
      key: "compliance",
      title: "Compliance Checklist",
      description: "Upload or reference compliance documents required for verification.",
      fields: [
        { key: "documents", label: "Document links", helper: "Share links to KRA certificates, insurance, municipal approvals" },
        { key: "screening", label: "Background screening", helper: "Describe your tenant/guest screening workflows" },
      ],
    },
    {
      key: "operations",
      title: "Operations & Utilities",
      description: "Explain how you run the portfolio day-to-day so we can align expectations.",
      fields: [
        { key: "utilities", label: "Utilities & billing", helper: "Who manages water, power, internet" },
        { key: "supportHours", label: "Support hours", helper: "Availability of on-site or remote staff" },
        { key: "paymentMethods", label: "Accepted payment methods", helper: "e.g., M-Pesa, card, bank transfer" },
      ],
    },
    {
      key: "contacts",
      title: "Primary Contacts",
      description: "Provide official contacts for enrollment, approvals, and incident response.",
      fields: [
        { key: "contactName", label: "Point of contact", helper: "Full name" },
        { key: "contactEmail", label: "Email", type: "email" },
        { key: "contactPhone", label: "Phone", helper: "+2547…" },
        { key: "supportChannels", label: "Support channels", helper: "Support hotline, WhatsApp, concierge" },
      ],
    },
    {
      key: "review",
      title: "Review & Submit",
      description: "Confirm everything looks accurate before submitting for approval.",
      fields: [],
    },
  ];

  readonly currentStepIndex = signal(0);
  readonly saving = signal(false);
  readonly submission = signal<"idle" | "saving" | "submitted" | "error">("idle");

  readonly form = this.fb.group({
    organization: this.fb.group({
      legalName: ["", Validators.required],
      registrationNo: [""],
      entityType: ["", Validators.required],
      portfolioScale: [""],
    }),
    compliance: this.fb.group({
      documents: [""],
      screening: [""],
    }),
    operations: this.fb.group({
      utilities: [""],
      supportHours: [""],
      paymentMethods: [""],
    }),
    contacts: this.fb.group({
      contactName: ["", Validators.required],
      contactEmail: ["", [Validators.required, Validators.email]],
      contactPhone: ["", Validators.required],
      supportChannels: [""],
    }),
    notes: [""],
  });

  private enrollment: LandlordEnrollment | null = null;

  readonly currentStep = computed(() => this.steps[this.currentStepIndex()]);

  async ngOnInit() {
    await this.loadEnrollment();
  }

  async loadEnrollment() {
    this.saving.set(true);
    try {
      const data = await firstValueFrom(this.cribs.getEnrollment());
      if (data) {
        this.enrollment = data;
        this.patchForm(data);
        const idx = this.steps.findIndex((step) => step.key === data.currentStep);
        if (idx >= 0) {
          this.currentStepIndex.set(idx);
        }
      }
    } finally {
      this.saving.set(false);
    }
  }

  private patchForm(data: LandlordEnrollment) {
    const payload = data.payload || {};
    if (payload.organization) {
      this.form.get("organization")?.patchValue(payload.organization);
    }
    if (payload.compliance) {
      this.form.get("compliance")?.patchValue(payload.compliance);
    }
    if (payload.operations) {
      this.form.get("operations")?.patchValue(payload.operations);
    }
    if (payload.contacts) {
      this.form.get("contacts")?.patchValue(payload.contacts);
    }
    if (payload.notes) {
      this.form.get("notes")?.patchValue(payload.notes);
    }
    if (data.contactName || data.contactEmail || data.contactPhone) {
      const control = this.form.get("contacts");
      if (control) {
        const current = (control.value as { supportChannels?: string | null }) ?? {};
        control.patchValue({
          contactName: data.contactName ?? "",
          contactEmail: data.contactEmail ?? "",
          contactPhone: data.contactPhone ?? "",
          supportChannels: current.supportChannels ?? "",
        });
      }
    }
  }

  async saveDraft() {
    this.saving.set(true);
    try {
      const payload = this.form.value;
      const next = await firstValueFrom(
        this.cribs.saveEnrollment({
          currentStep: this.currentStep().key,
          payload,
          contactName: payload.contacts?.contactName ?? "",
          contactEmail: payload.contacts?.contactEmail ?? "",
          contactPhone: payload.contacts?.contactPhone ?? "",
        })
      );
      this.enrollment = next;
    } finally {
      this.saving.set(false);
    }
  }

  async submitEnrollment() {
    if (!this.enrollment) {
      await this.saveDraft();
    }
    if (!this.enrollment) return;
    this.submission.set("saving");
    try {
      await this.saveDraft();
      await firstValueFrom(this.cribs.submitEnrollment(this.enrollment!.id));
      this.submission.set("submitted");
    } catch (error) {
      console.error("submit failed", error);
      this.submission.set("error");
    }
  }

  nextStep() {
    if (this.currentStepIndex() < this.steps.length - 1) {
      this.currentStepIndex.update((v) => v + 1);
    }
  }

  prevStep() {
    if (this.currentStepIndex() > 0) {
      this.currentStepIndex.update((v) => v - 1);
    }
  }
}
