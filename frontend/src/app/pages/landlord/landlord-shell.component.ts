import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { SessionService } from "../../core/session.service";
import { CribsService } from "../../core/cribs.service";
import { LandlordProfile, Property } from "../../shared/models";
import { firstValueFrom } from "rxjs";

@Component({
  selector: "app-landlord-shell",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgFor, NgIf, AsyncPipe],
  templateUrl: "./landlord-shell.component.html",
  styleUrl: "./landlord-shell.component.css",
})
export class LandlordShellComponent implements OnInit {
  private session = inject(SessionService);
  private cribs = inject(CribsService);

  readonly profile = signal<LandlordProfile | null>(null);
  readonly properties = signal<Property[]>([]);
  readonly loading = signal(true);

  readonly tabs = [
    { label: "Overview", link: "/landlord" },
    { label: "Create property", link: "/landlord/properties/new" },
  ];

  async ngOnInit() {
    await this.session.ensure();
    await this.bootstrap();
  }

  private async bootstrap() {
    this.loading.set(true);
    try {
      let profile: LandlordProfile | null = null;
      try { profile = await firstValueFrom(this.cribs.getLandlordProfile()); } catch { profile = null; }
      let props: Property[] = [];
      try { props = await firstValueFrom(this.cribs.listProperties()); } catch { props = []; }
      this.profile.set(profile);
      this.properties.set(props);
    } finally {
      this.loading.set(false);
    }
  }
}
