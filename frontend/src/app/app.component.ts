import { Component, OnInit, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { SessionService } from "./core/session.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./app.component.html",
})
export class AppComponent implements OnInit {
  private session = inject(SessionService);
  isDark = false;
  async ngOnInit() {
    const persisted = (localStorage.getItem('theme') || '').toLowerCase();
    const preferDark = persisted === 'dark';
    this.setTheme(preferDark ? 'dark' : 'light');
    try {
      await this.session.ensure();
    } catch (error) {
      console.warn("session bootstrap failed", error);
    }
  }
  toggleTheme() { this.setTheme(this.isDark ? 'light' : 'dark'); }
  private setTheme(mode: 'light' | 'dark') {
    this.isDark = mode === 'dark';
    document.documentElement.classList.toggle('dark', mode === 'dark');
    try { localStorage.setItem('theme', mode); } catch {}
  }
}
