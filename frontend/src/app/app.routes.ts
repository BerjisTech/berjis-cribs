import { Routes } from "@angular/router";
import { ExploreComponent } from "./pages/explore/explore.component";
import { EnrollmentComponent } from "./pages/enrollment/enrollment.component";
import { LandlordShellComponent } from "./pages/landlord/landlord-shell.component";
import { LandlordDashboardComponent } from "./pages/landlord/landlord-dashboard.component";
import { PropertyWizardComponent } from "./pages/landlord/property-wizard.component";
import { PropertyWorkspaceComponent } from "./pages/landlord/property-workspace.component";
import { AdminShellComponent } from "./pages/admin/admin-shell.component";
import { AdminEnrollmentsComponent } from "./pages/admin/admin-enrollments.component";
import { AdminPropertiesComponent } from "./pages/admin/admin-properties.component";
import { authGuard, adminGuard } from "./core/auth.guard";

export const routes: Routes = [
  { path: "", component: ExploreComponent, title: "Berjis Cribs" },
  { path: "search", component: ExploreComponent, title: "Search Cribs" },
  { path: "enroll", component: EnrollmentComponent, canActivate: [authGuard], title: "Landlord Enrollment" },
  {
    path: "landlord",
    component: LandlordShellComponent,
    canActivate: [authGuard],
    children: [
      { path: "", component: LandlordDashboardComponent },
      { path: "properties/new", component: PropertyWizardComponent },
      { path: "properties/:id", component: PropertyWorkspaceComponent },
    ],
  },
  {
    path: "admin/cribs",
    component: AdminShellComponent,
    canActivate: [adminGuard],
    children: [
      { path: "", component: AdminEnrollmentsComponent },
      { path: "landlords", component: AdminEnrollmentsComponent },
      { path: "properties", component: AdminPropertiesComponent },
    ],
  },
  { path: "**", redirectTo: "" },
];
