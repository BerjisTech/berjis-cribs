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

  async ngOnInit() {
    try {
      await this.session.ensure();
    } catch (error) {
      console.warn("session bootstrap failed", error);
    }
  }
}
