import { Routes } from "@angular/router";
import { ExploreComponent } from "./pages/explore/explore.component";
import { EnrollmentComponent } from "./pages/enrollment/enrollment.component";
import { DashboardComponent } from "./pages/dashboard/dashboard.component";
import { TenantCribComponent } from "./pages/tenant/tenant-crib.component";
import { LandlordShellComponent } from "./pages/landlord/landlord-shell.component";
import { LandlordDashboardComponent } from "./pages/landlord/landlord-dashboard.component";
import { PropertyWizardComponent } from "./pages/landlord/property-wizard.component";
import { PropertyWorkspaceComponent } from "./pages/landlord/property-workspace.component";
import { AdminShellComponent } from "./pages/admin/admin-shell.component";
import { AdminEnrollmentsComponent } from "./pages/admin/admin-enrollments.component";
import { AdminPropertiesComponent } from "./pages/admin/admin-properties.component";
import { AppSidebarsComponent } from "./app-sidebars/app-sidebars.component";
import { authGuard, adminGuard, landlordGuard } from "./core/auth.guard";

export const routes: Routes = [
  { path: "", component: ExploreComponent, title: "Berjis Cribs" },
  { path: "search", component: ExploreComponent, title: "Search Cribs" },
  { path: "enroll", component: EnrollmentComponent, canActivate: [authGuard], title: "Landlord Enrollment" },
  {
    path: "",
    component: AppSidebarsComponent,
    children: [
      { path: "dashboard", component: DashboardComponent, canActivate: [authGuard], title: "Cribs Dashboard" },
      { path: "crib/:id", component: TenantCribComponent, canActivate: [authGuard], title: "Crib Overview" },
      {
        path: "landlord",
        component: LandlordShellComponent,
        canActivate: [authGuard, landlordGuard],
        children: [
          { path: "", component: LandlordDashboardComponent },
          { path: "properties/new", component: PropertyWizardComponent },
          { path: "properties/:id/edit", component: PropertyWizardComponent },
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
    ],
  },
  { path: "**", redirectTo: "" },
];
