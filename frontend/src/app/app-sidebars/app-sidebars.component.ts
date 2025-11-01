import { AsyncPipe, DatePipe, NgFor, NgIf } from "@angular/common";
import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CribsService } from "../core/cribs.service";
import { SessionService } from "../core/session.service";
import { NotificationItem } from "../shared/models";

interface NavItem {
  label: string;
  link: string;
  icon: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  requiresLandlord?: boolean;
}

@Component({
  selector: "app-sidebars",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgFor, NgIf, AsyncPipe, DatePipe],
  templateUrl: "./app-sidebars.component.html",
  styleUrl: "./app-sidebars.component.css",
})
export class AppSidebarsComponent implements OnInit {
  private session = inject(SessionService);
  private cribs = inject(CribsService);

  private navCollapsedState = signal(false);
  private toolsCollapsedState = signal(true);
  private notificationsState = signal<NotificationItem[]>([]);

  readonly userSignal = this.session.user;

  private navItemsComputed = computed<NavItem[]>(() => {
    const items: NavItem[] = [
      { label: "Dashboard", link: "/dashboard", icon: "📊", requiresAuth: true },
      { label: "Landlord Suite", link: "/landlord", icon: "🏢", requiresLandlord: true },
      { label: "Admin", link: "/admin/cribs", icon: "🛡️", requiresAdmin: true },
    ];

    return items.filter((item) => {
      if (item.requiresAdmin) {
        return this.session.isAdmin();
      }
      if (item.requiresLandlord) {
        return this.session.isLandlordTeam();
      }
      if (item.requiresAuth) {
        return !!this.user();
      }
      return true;
    });
  });

  async ngOnInit() {
    await this.session.ensure();
    await this.loadNotifications();
  }

  private async loadNotifications() {
    if (!this.session.isLandlordTeam() && !this.session.isAdmin()) {
      this.notificationsState.set([]);
      return;
    }
    try {
      const list = await firstValueFrom(this.cribs.getNotifications());
      this.notificationsState.set(list ?? []);
    } catch (error) {
      console.warn("notifications unavailable", error);
      this.notificationsState.set([]);
    }
  }

  navCollapsed() {
    return this.navCollapsedState();
  }

  toggleNav() {
    this.navCollapsedState.update((value) => !value);
  }

  toolsCollapsed() {
    return this.toolsCollapsedState();
  }

  toggleTools() {
    this.toolsCollapsedState.update((value) => !value);
  }

  notifications() {
    return this.notificationsState();
  }

  user() {
    return this.userSignal();
  }

  isAdmin() {
    return this.session.isAdmin();
  }

  canManageLandlord() {
    return this.session.isLandlordTeam();
  }

  get navItems() {
    return this.navItemsComputed();
  }
}
