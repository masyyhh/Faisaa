# Finora — Personal Finance & Wealth Command Center

Finora is a full-stack, dark-first fintech personal finance web application built with **React**, **Vite**, **Tailwind CSS**, **Recharts**, **Node.js**, **Express**, **Prisma ORM**, and **PostgreSQL / SQLite**.

---

## 1. Project Overview

Finora empowers users to track multi-institution financial accounts, log income/expenses/transfers with real-time balance synchronization, manage monthly category budgets with threshold alerts, monitor savings goals with milestones, track bills & recurring subscriptions, and analyze their net worth and cashflow trends across interactive charts.

---

## 2. Tech Stack

### Frontend (`client/`)
- **React 19** + **Vite**
- **Tailwind CSS v4** (Dark-first fintech glassmorphism UI + Light Mode support)
- **React Router v7** (Protected routes, layout nesting)
- **Recharts** (8+ responsive financial charts)
- **Lucide React** (Fintech iconography)
- **Axios** (JWT interceptor API client)

### Backend (`server/`)
- **Node.js** + **Express.js** (REST API architecture)
- **Prisma ORM** (`schema.postgresql.prisma` for PostgreSQL production + `schema.prisma` for instant local SQL persistence)
- **JWT (`jsonwebtoken`)** + **`bcryptjs`** (Stateless authentication & 10-round salted password hashing)
- **Zod** (Request payload validation)
- **Helmet, CORS & Express Rate Limit** (Security hardening)

---

## 3. Core Features

1. **Authentication & Security**: Register, Login, 1-Click Demo Login (`alex@finora.io` / `Password123!`), JWT protected routes, profile management, and password change.
2. **Executive Dashboard**: Hero balance card with account switcher, hide/show balance privacy toggle (`••••••`), quick actions (`+ Income`, `+ Expense`, `Transfer`, `+ Account`), monthly KPIs, 6-month cashflow trend chart, category donut chart, budget health, savings goals, and upcoming bills.
3. **Accounts & Institutions**: Support for Checking, Savings, Credit Card, Investment, Cash, Loan, and Other accounts, 6-month balance history curves, and atomic account-to-account money transfers.
4. **Transactions & Recurring Engine**: Fast transaction modal, multi-parameter filtering (search, date range, account, category, type, sort), pagination, transaction duplication, and automated recurring schedules (`DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`).
5. **Monthly Budgets**: Category-level monthly spending limits with live progress bars and color states (`Normal`, `Warning`, `Near Limit`, `Over Budget`) plus 6-month historical budget vs actual charts.
6. **Savings Goals**: Circular SVG and linear progress indicators, target dates, milestones, and `+ Add Money` / `Withdraw` flows with optional bank account balance sync.
7. **Bills & Subscriptions**: Monthly & yearly normalized recurring cost metrics, overdue warnings, and 1-click **Mark as Paid** that logs the expense transaction and advances the due date.
8. **8-Chart Analytics Suite**: Income vs Expenses, Cashflow Over Time, Spending by Category, Top Merchants, Account Balances, Monthly Comparison, Budget Performance, and Cumulative Savings Growth with 7 date range presets.
9. **Net Worth Dashboard**: `Net Worth = Total Assets - Total Liabilities` with debt-to-asset ratio, monthly delta, 6-month historical net worth curve, and asset/liability breakdowns.
10. **CSV & JSON Import/Export**: Validated CSV transaction import with column checking & preview table, CSV ledger export, and full JSON workspace backup/restore.

---

## 4. Folder Structure

```text
finora/
├── package.json                  # Unified root scripts (npm run dev, build, seed)
├── scripts/
│   └── dev.mjs                   # Concurrent runner for Server + Client
├── client/                       # React + Vite + Tailwind Frontend
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── components/ui/        # Reusable Card, Button, Modal, Badge, ProgressBar, ConfirmDialog
│       ├── context/              # AuthContext (JWT session, theme, privacy mask, toasts)
│       ├── features/transactions/# Global fast TransactionModal
│       ├── layouts/              # AppLayout (Sidebar, Mobile Bottom Nav, Global Cmd+K Search, Notifications)
│       ├── pages/                # Dashboard, Transactions, Accounts, Budgets, Goals, Bills, Analytics, NetWorth, Settings, Auth
│       ├── services/             # Axios API client
│       └── utils/                # Multi-currency (USD, EUR, GBP, MVR, INR, AUD, CAD, JPY) & date formatters
└── server/                       # Node.js + Express + Prisma Backend
    ├── prisma/
    │   ├── schema.postgresql.prisma  # Production PostgreSQL Prisma schema
    │   └── schema.prisma             # Active Prisma schema
    └── src/
        ├── controllers/          # Auth, Account, Transaction, Category, Budget, Goal, Recurring, Bill, Analytics, Data, Notification
        ├── middleware/           # JWT protection & global Zod/Express error handler
        ├── prisma/               # Prisma singleton client & comprehensive demo seeder
        ├── routes/               # REST API routes (/api/*)
        ├── validators/           # Zod validation schemas
        └── index.js              # Express server entry point
```

---

## 5. Installation

```bash
npm install
npm --prefix server install
npm --prefix client install
```

---

## 6. Environment Variables

Create `server/.env` (already pre-configured for local development):

```env
# PostgreSQL Production URL:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/finora?schema=public"
# Local Zero-Config SQL URL:
DATABASE_URL="file:./finora.db"

JWT_SECRET="finora_super_secret_jwt_key_2026_production_ready"
PORT=5000
CLIENT_URL="http://localhost:5173"
```

---

## 7. Database Setup & 8. Prisma Migration Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Push schema / run migrations
npm run prisma:push
# Or for PostgreSQL migration history:
npm run prisma:migrate
```

---

## 9. Seed Commands

```bash
npm run seed
```
This populates the demo account:
- **Email**: `alex@finora.io`
- **Password**: `Password123!`

---

## 10. Development Commands

Run both the Express API (`http://localhost:5000`) and Vite React Frontend (`http://localhost:5173`) with a single command from the root directory:

```bash
npm run dev
```

---

## 11. Production Build & Deployment

### Option A: Unified Node.js Production Server (Single Port)
Builds the React SPA into `client/dist`, generates the Prisma Client, and serves both the frontend (with immutable asset caching & SPA routing) and `/api/*` REST endpoints from Express on `PORT` (`5001`):

```bash
# Optional: Switch Prisma to PostgreSQL (or keep SQLite with `npm run db:sqlite`)
npm run db:postgres

# Build frontend & generate Prisma Client
npm run build

# Push/apply schema & start in production mode
npm run prisma:push
npm start
```

### Option B: Docker & Docker Compose (PostgreSQL 16 + Finora)
Deploy the full stack (PostgreSQL 16 with persistent volume + Finora production container with healthchecks):

```bash
docker compose up -d --build
```

### Health Check Endpoint
- `GET /api/health`: Verifies live database connectivity (`SELECT 1`), reports service status (`healthy` / `degraded`), environment, and uptime.

---

## 12. REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user & initialize default categories |
| `POST` | `/api/auth/login` | Authenticate user & return JWT |
| `GET` | `/api/auth/me` | Get current user profile |
| `PUT` | `/api/auth/profile` | Update profile, currency, date format, theme |
| `PUT` | `/api/auth/password` | Change password with bcrypt verification |
| `GET/POST` | `/api/accounts` | List all accounts & summary / Create account |
| `POST` | `/api/accounts/transfer` | Atomic transfer between two accounts |
| `GET/PUT/DELETE` | `/api/accounts/:id` | Account detail with 6-month balance curve / Update / Delete |
| `GET/POST` | `/api/transactions` | Paginated, filtered transactions / Create transaction |
| `GET/PUT/DELETE` | `/api/transactions/:id` | Transaction detail / Update / Delete with balance reversal |
| `POST` | `/api/transactions/:id/duplicate` | Duplicate transaction |
| `GET/POST/PUT/DELETE` | `/api/categories` | Manage income & expense categories |
| `GET/POST/PUT/DELETE` | `/api/budgets` | Manage monthly budgets & historical performance |
| `GET/POST/PUT/DELETE` | `/api/goals` | Manage savings goals & milestones |
| `POST` | `/api/goals/:id/contribute` | Deposit or withdraw funds from a savings goal |
| `GET/POST/PUT/DELETE` | `/api/recurring` | Manage recurring transaction schedules |
| `GET/POST/PUT/DELETE` | `/api/bills` | Manage recurring bills & subscriptions |
| `POST` | `/api/bills/:id/pay` | Mark bill as paid, log expense, and advance due date |
| `GET` | `/api/analytics/dashboard` | Unified executive dashboard metrics |
| `GET` | `/api/analytics/cashflow` | Cashflow timeline, income vs expenses & savings growth |
| `GET` | `/api/analytics/categories` | Category & top merchant spending breakdown |
| `GET` | `/api/analytics/net-worth` | Assets, liabilities & 6-month historical net worth |
| `GET/POST` | `/api/data/export/csv` & `/api/data/import/csv` | CSV import/export |
| `GET/POST` | `/api/data/export/json` & `/api/data/import/json` | JSON backup/restore |
