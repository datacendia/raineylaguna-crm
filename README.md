# Rainey Laguna CRM

Lead management system for Rainey Laguna Studios. Manages 1,000+ SMB leads across Lima's 5 districts.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Generate a password hash:
```bash
npm run hash -- "your-secure-password"
```
Copy the printed `CRM_PASSWORD_HASH=...` line into `.env.local`.

3. Set the rest of `.env.local`:
```
CRM_PASSWORD_HASH=<from step 2>
CRM_COOKIE_SECRET=<32+ random characters>
DATABASE_URL=postgresql://user:password@localhost:5432/raineylaguna
REDIS_URL=redis://localhost:6379
```

4. Run database schema:
```bash
psql -U user -d raineylaguna -f ../raineylaguna/database/crm-schema.sql
```

5. Seed initial leads (~330 from the Lima report):
```bash
npm run seed
```

6. Start development server:
```bash
npm run dev
```

7. (Optional) Start the BullMQ outreach worker in a separate terminal:
```bash
npm run worker
```

## Features

- **Authentication**: Password-protected admin section
- **Lead Management**: Import, filter, and manage leads
- **Pipeline View**: Kanban-style pipeline (Lead → Contacted → Audited → Proposal → Closed)
- **Outreach Tracking**: Log email, Instagram, WhatsApp, LinkedIn outreach
- **Video Audits**: Track Loom video audits and conversions
- **CSV Import**: Bulk import leads from research data

## Routes

- `/login` - Login page
- `/dashboard` - Main dashboard
- `/dashboard/leads` - Lead list with filters
- `/dashboard/pipeline` - Pipeline kanban view
- `/dashboard/outreach` - Outreach tracking
- `/dashboard/video-audits` - Video audit management

## API Endpoints

- `POST /api/auth/login` - Authentication
- `GET /api/leads` - Fetch leads with filters
- `POST /api/leads` - Create new lead
- `POST /api/import` - Import CSV leads
- `POST /api/outreach` - Log outreach event
- `GET /api/outreach` - Fetch outreach events
- `POST /api/video-audits` - Add video audit
- `GET /api/video-audits` - Fetch video audits
