# RealEstate Management Platform - Product Requirements Document (CRIBS)

## Executive Summary
A comprehensive property management system for Kenya's diverse real estate market, supporting residential rentals, BnBs, short-term rentals, motels, and hotels. The platform handles Kenya's complex addressing system (simple sequential, block-based, phase-based, floor-based, and hybrid combinations) while enabling landlords to manage properties, collect payments, communicate with tenants, and generate reports. Tenants can rent by night, week, or month with full dashboard access.

## Technical Stack
- **Frontend**: Angular (vanilla, minimal external dependencies)
- **Backend**: Go
- **Maps**: Mapbox
- **Notifications**: SMS integration (primary) + Email
- **Database**: PostgreSQL (recommended for relational data)
- **Authentication**: JWT-based

## Core Functionality

### 1. Flexible Address & Property System

#### Property Hierarchy
```
Organization → Property → Building → Unit (Door)
```

#### Address System Types (All Must Be Supported)
1. **Simple Sequential**: `1, 2, 3...` or `A, B, C...`
2. **Block-Based**: `A1, A2, A3, B1, B2...`
3. **Phase-Based**: `GA1, GA2, GB1, GB2...` (Block + Phase)
4. **Floor-Based**: 
   - Ground: `G1, G2, G3`
   - First: `101, 102, 103` or `11, 12, 13`
   - Second: `201, 202, 203` or `21, 22, 23`
5. **Hybrid**: `AB103` (Block A, Phase B, Door 3, Floor 1)
6. **Standalone**: Single door, no number required
7. **Unnumbered Multiple**: Force to simple sequential (1, 2, 3...)

#### Unit Schema
```
- unit_id (UUID)
- property_id (foreign key)
- building_id (nullable)
- address_type (enum)
- block (nullable string)
- phase (nullable string)
- floor (nullable integer)
- door_number (string) - computed or manual
- display_name (string) - human-readable
- unit_type (enum: apartment, room, house, studio, etc)
- status (enum: available, occupied, maintenance)
- maintenance_note (text)
```

### 2. User Roles & Permissions

#### Landlord/Owner
- Full property management access
- Staff management with granular permissions
- Financial reports and analytics
- Bulk operations (messaging, status updates)

#### Staff Roles (Configurable Permissions)
- **Property Manager**: All property operations, tenant management, no financial settings
- **Maintenance**: Update unit status, view maintenance requests, communicate with tenants
- **Accountant**: Financial reports, payment tracking, receipt generation
- **Reception**: Tenant check-in/check-out, availability management
- **Custom**: Granular permission assignment

#### Tenant
- View own unit(s) and lease details
- Make payments
- Submit maintenance requests
- Access group communication
- View receipts and payment history
- Rate/review property (optional)

### 3. Property Management Features

#### Visual Unit Management
- **Interactive Map View** (Mapbox)
  - Property location on map
  - Click property → view building layout
  - Color-coded units on building layout
  
- **Table/Grid View**
  - Sortable/filterable by status, block, floor, etc
  - Bulk selection for operations
  
- **Color Coding**
  - 🟢 **Green**: Occupied
  - 🔴 **Red**: Available
  - 🔵 **Blue Border**: Under Maintenance (can overlay on green/red)
  - 🟡 **Yellow**: Reserved/Pending
  - ⚫ **Gray**: Inactive/Unlisted

#### Unit Status Management
- Single and bulk status updates
- Maintenance scheduling with date ranges
- Automated status changes (e.g., lease expiry → available)
- Status history log

### 4. Tenancy Management

#### Lease Types
- **Monthly**: Standard monthly rental
- **Nightly**: Hotels, motels, BnBs
- **Weekly**: Short-term rentals
- **Custom**: Flexible duration (e.g., 3 months, 6 months)

#### Lease Management
- Create lease with:
  - Unit assignment
  - Tenant details
  - Rate (per night/week/month)
  - Start/end dates
  - Deposit amount
  - Terms and conditions
  - Auto-renewal settings
- Lease expiry notifications (SMS + Email)
- Lease renewal workflow
- Early termination handling

### 5. Payment System

#### Payment Features
- Multiple payment methods:
  - M-Pesa integration (Kenya standard)
  - Bank transfer
  - Cash (logged by staff)
  - Card payments
- Payment tracking per lease
- Automated rent reminders (SMS + Email)
- Partial payment handling
- Deposit management
- Automated receipt generation

#### Receipt Generation
- PDF receipts with:
  - Property/unit details
  - Payment amount and date
  - Balance/arrears
  - Landlord/company info
  - Receipt number
- Email to tenant automatically
- SMS notification with receipt link
- Receipt history archive

### 6. Communication System

#### Group Communication
- **Property-Wide Group**: All tenants + relevant staff
- **Building-Specific Group**: Per building
- **Unit-Specific Thread**: Tenant + assigned staff
- **Announcements**: Landlord → all tenants (read-only)

#### Message Features
- Text messages
- File attachments (photos, PDFs)
- Maintenance request forms
- Polls (e.g., for community decisions)
- Priority flags (urgent maintenance)
- Message history/archive

#### Notifications
- **SMS** (primary):
  - Payment reminders
  - Payment confirmations
  - Lease expiry warnings
  - Maintenance updates
  - Important announcements
- **Email**:
  - Receipts
  - Monthly statements
  - Detailed reports
  - Lease documents
- **In-App**:
  - Real-time messaging
  - Status updates

### 7. Reports & Analytics

#### Landlord Reports
- **Financial**:
  - Monthly/quarterly/annual income
  - Payment collection rates
  - Arrears summary
  - Expense tracking
  - Profit/loss statements
  - Tax-ready reports
  
- **Occupancy**:
  - Occupancy rates by property/building/unit type
  - Average stay duration
  - Vacancy trends
  - Seasonal analysis (for short-term rentals)
  
- **Maintenance**:
  - Maintenance cost per unit
  - Average resolution time
  - Recurring issues
  
- **Tenant**:
  - Payment history by tenant
  - Lease history
  - Average tenant rating

#### Export Formats
- PDF (formatted reports)
- Excel/CSV (raw data)
- Email scheduled reports

### 8. Dashboard Views

#### Landlord Dashboard
- **Overview Cards**:
  - Total properties/units
  - Occupancy rate
  - Monthly revenue
  - Pending payments
  - Active maintenance requests
  
- **Quick Actions**:
  - Add property/unit
  - Create lease
  - Record payment
  - Send announcement
  
- **Visual Charts**:
  - Revenue trends (line chart)
  - Occupancy by property (bar chart)
  - Payment status (pie chart)
  - Maintenance requests (status breakdown)
  
- **Recent Activity Feed**:
  - New leases
  - Payments received
  - Maintenance completed
  - Lease expiries

#### Tenant Dashboard
- **Overview Cards**:
  - Unit details
  - Rent due date
  - Balance/arrears
  - Active maintenance requests
  
- **Quick Actions**:
  - Pay rent
  - Submit maintenance request
  - Contact management
  - View receipts
  
- **Lease Information**:
  - Lease terms
  - Payment history
  - Upcoming payments
  - Documents

#### Staff Dashboard (Permission-Based)
- Assigned tasks/units
- Pending actions
- Communication threads
- Relevant reports

### 9. Maintenance Management

#### Request System
- Tenant submits request with:
  - Category (plumbing, electrical, etc)
  - Description
  - Photos
  - Urgency level
  
- Landlord/staff:
  - Assign to staff member
  - Update status (pending → in-progress → completed)
  - Add notes/photos
  - Track costs
  - Mark unit under maintenance

#### Scheduled Maintenance
- Calendar view for planned maintenance
- Automated tenant notifications
- Prevent new bookings during maintenance (short-term rentals)
- Maintenance history per unit

### 10. Search & Filtering

#### Global Search
- Search across:
  - Properties (by name, location)
  - Units (by door number, block, floor)
  - Tenants (by name, phone, email)
  - Leases (by ID, dates)
  - Payments (by receipt number, amount)

#### Advanced Filters
- Properties: location, type, occupancy rate
- Units: status, type, floor, block, phase
- Tenants: payment status, lease status
- Payments: date range, method, status

### 11. Mobile Responsiveness
- Full responsive design for all screen sizes
- Mobile-first approach for tenant dashboard
- Touch-optimized interactions
- Progressive Web App (PWA) capabilities for offline access

## Data Security & Privacy
- End-to-end encryption for sensitive data
- Role-based access control (RBAC)
- Audit logs for all critical actions
- GDPR-compliant data handling
- Secure file storage for documents
- Regular automated backups

## Integration Requirements

### Essential Integrations
1. **M-Pesa API** (Safaricom Daraja)
   - STK Push for payments
   - Payment confirmation callbacks
   - Transaction queries

2. **SMS Gateway** (AfricasTalking or Twilio)
   - Transactional SMS
   - Bulk SMS for announcements
   - Delivery reports

3. **Email Service** (SendGrid or AWS SES)
   - Transactional emails
   - Receipt delivery
   - Scheduled reports

4. **Mapbox**
   - Property location mapping
   - Building layout visualization
   - Interactive floor plans

### Optional Integrations
- KRA iTax (for tax compliance)
- WhatsApp Business API (alternative messaging)
- Automated bank reconciliation

## Performance Requirements
- Page load time: < 2 seconds
- API response time: < 500ms (95th percentile)
- Support 10,000+ concurrent users
- Real-time notifications (< 5 second delivery)
- Handle 100,000+ units across platform

## Deployment & Scalability
- Containerized deployment (Docker)
- Horizontal scaling capability
- Load balancing for high availability
- CDN for static assets
- Database read replicas for reporting
- Queue system for heavy operations (report generation, bulk SMS)

## Initial Setup Workflow

### Landlord Onboarding
1. Register account (name, email, phone, ID verification)
2. Add first property (name, location on map, type)
3. Define building structure (floors, blocks, phases)
4. Add units (auto-generate or manual entry)
5. Invite staff (optional)
6. Configure payment methods
7. Add existing tenants (if any)

### Tenant Onboarding
1. Invited by landlord via SMS/Email
2. Create account with verification code
3. View assigned unit and lease terms
4. Accept terms and conditions
5. Make first payment (deposit + rent)
6. Access full dashboard

## Success Metrics
- Time to add new property: < 10 minutes
- Time to create lease: < 5 minutes
- Payment success rate: > 95%
- SMS delivery rate: > 98%
- Tenant satisfaction score: > 4/5
- Landlord dashboard engagement: Daily active usage

## Future Enhancements (Post-MVP)
- Tenant marketplace (available properties listing)
- Virtual property tours
- AI-powered rent optimization
- Predictive maintenance
- Integration with utilities (electricity, water)
- Mobile apps (iOS/Android native)
- Multi-currency support
- Multi-language support (English/Swahili)

---

## Technical Implementation Notes

### Angular Architecture
- Modular structure: core, shared, feature modules
- Lazy loading for feature modules
- RxJS for state management (avoid external libraries)
- Custom form validators for address validation
- Reusable components for unit status cards, payment forms
- Custom directives for permission-based rendering
- Angular animations for smooth transitions
- Service workers for PWA functionality

### Go Backend Architecture
- Clean architecture (handler → service → repository)
- JWT middleware for authentication
- RBAC middleware for authorization
- Goroutines for async operations (SMS, emails)
- GORM for database ORM
- Gin or Echo for HTTP framework
- WebSocket support for real-time messaging
- Scheduled jobs (cron) for rent reminders, lease expiry checks
- API versioning (/api/v1/)
- Comprehensive error handling and logging

### Database Schema Highlights
```
- organizations (landlord companies)
- users (landlords, staff, tenants)
- properties (buildings, compounds)
- units (individual doors/rooms)
- leases (rental agreements)
- payments (transaction records)
- maintenance_requests
- messages (group communication)
- receipts
- audit_logs
```

### API Design
- RESTful conventions
- Pagination for list endpoints
- Filtering, sorting, searching on list endpoints
- Bulk operation endpoints (e.g., POST /units/bulk-status-update)
- File upload endpoints for documents/photos
- WebSocket endpoints for real-time messaging
- Webhook endpoints for payment callbacks

### Mapbox Implementation
- Property marker clustering for map overview
- Custom building layout overlays
- Interactive unit selection on floor plans
- Color-coded unit markers matching status
- Geocoding for address input
- Offline map caching for mobile

This system should be production-ready, scalable, and tailored to Kenya's unique real estate market while maintaining simplicity for users of all technical levels.