import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { SessionService } from "./core/session.service";
import { CribsService } from "./core/cribs.service";
import { NotificationItem } from "./shared/models";

interface NavItem {
  label: string;
  icon: string;
  link: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgFor, NgIf, NgClass, AsyncPipe, DatePipe],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent implements OnInit {
  private session = inject(SessionService);
  private cribs = inject(CribsService);

  readonly navCollapsed = signal(false);
  readonly toolsCollapsed = signal(false);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly user = computed(() => this.session.user());
  readonly isAdmin = computed(() => this.session.isAdmin());

  readonly navItems: NavItem[] = [
    { label: "Discover", icon: "i-mdi-map-search", link: "/" },
    { label: "Search", icon: "🔍", link: "/search" },
    { label: "Enroll", icon: "📝", link: "/enroll", requiresAuth: true },
    { label: "Landlord", icon: "🏠", link: "/landlord", requiresAuth: true },
    { label: "Admin", icon: "👑", link: "/admin/cribs", requiresAdmin: true },
  ];

  async ngOnInit() {
    await this.session.ensure();
    await this.refreshNotifications();
  }

  async refreshNotifications() {
    try {
      if (!this.user()) return;
      const list = await firstValueFrom(this.cribs.getNotifications());
      this.notifications.set(list.slice(0, 8));
    } catch (error) {
      console.warn("notifications fetch failed", error);
    }
  }

  toggleNav() {
    this.navCollapsed.update((v) => !v);
  }

  toggleTools() {
    this.toolsCollapsed.update((v) => !v);
  }
}
