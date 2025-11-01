import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { SessionService } from "../../core/session.service";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../../core/cribs.service";
import { LandlordEnrollment, Property } from "../../shared/models";

@Component({
  selector: "app-admin-shell",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgFor, NgIf, AsyncPipe],
  templateUrl: "./admin-shell.component.html",
  styleUrl: "./admin-shell.component.css",
})
export class AdminShellComponent implements OnInit {
  private session = inject(SessionService);
  private cribs = inject(CribsService);

  readonly nav = [
    { label: "Landlord enrollments", link: "/admin/cribs" },
    { label: "Property approvals", link: "/admin/cribs/properties" },
  ];

  readonly pendingEnrollments = signal<number>(0);
  readonly pendingProperties = signal<number>(0);

  async ngOnInit() {
    await this.session.ensure();
    const [enrollments, properties] = await Promise.all([
      firstValueFrom(this.cribs.adminListEnrollments("submitted")),
      firstValueFrom(this.cribs.adminListProperties("pending_review")),
    ]);
    this.pendingEnrollments.set(enrollments.length);
    this.pendingProperties.set(properties.length);
  }
}
