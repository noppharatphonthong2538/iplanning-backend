# iPlanning — Project Context for Claude

## Overview
iPlanning คือ Project Management Web App สำหรับบริหารโปรเจกต์ IT แบบครบวงจร ประกอบด้วย:
- **Requirements** — จัดการ Requirement ของโปรเจกต์
- **Standard Manday** — ตั้งค่า Manday มาตรฐานแต่ละ Task type
- **Tasks** — จัดการ Task/Phase/Milestone พร้อม Role-MD
- **Cal MD** — คำนวณ Manday แบบ % หรือ Fixed
- **Cost** — คำนวณต้นทุนจาก Manday × Rate
- **Plan** — Gantt Chart พร้อม dependency (FS/FF/SS/SF), drag-to-move, auto cascade, holiday config

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| State Management | Zustand (`useProjectStore`) |
| Backend | NestJS (Node.js) |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Styling | CSS Variables (dark/light theme) |
| Toast | react-hot-toast |

---

## Folder Structure

```
IPlanning/
├── Frontend/               # React + Vite app (port 5173)
│   └── src/
│       ├── components/
│       │   ├── common/     # ImportExportToolbar
│       │   ├── layout/     # TopBar, MainContent
│       │   ├── modals/     # CreateProjectModal, ProjectManageModal
│       │   └── tabs/
│       │       ├── plan/   # PlanTab.tsx ← Gantt chart (ไฟล์หลัก)
│       │       │   └── ganttUtils.ts ← utility functions ทั้งหมด
│       │       ├── tasks/  # TasksTab.tsx
│       │       ├── calmd/  # CalMdTab.tsx
│       │       ├── cost/   # CostTab.tsx
│       │       ├── requirements/
│       │       └── stdmd/
│       ├── hooks/
│       │   └── useProjectData.ts  # fetch + transform API data → store
│       ├── services/
│       │   └── api.ts             # axios API calls
│       ├── store/
│       │   └── useProjectStore.ts # Zustand global store
│       └── types/
│           └── index.ts           # TypeScript interfaces ทั้งหมด
│
└── Backend/                # NestJS app (port 3001)
    ├── prisma/
    │   ├── schema.prisma   # DB schema
    │   └── migrations/     # migration files
    └── src/modules/
        ├── projects/       # CRUD project + duplicate
        ├── tasks/          # CRUD task + reorder + startDate/endDate
        ├── phases/         # CRUD phase
        ├── requirements/
        ├── roles/
        ├── stdmd/
        ├── calmd/
        ├── cost/
        ├── sources/
        └── import-export/  # xlsx import/export
```

---

## Key Files

### Frontend
- **`PlanTab.tsx`** — Gantt chart หลัก, ใหญ่มาก (~1300 lines)
  - `saveTask()` — debounced save พร้อม toast error
  - `cascadeSuccessors()` — BFS คำนวณ date ทุก successor
  - `handleAutoSet()` — Auto set Task1=projectStart, ต่อกัน FS
  - `calcEarliestStart()` — คำนวณ earliest start จาก predecessors (FS/FF/SS/SF + lag)
  - Popup components: `HolidayPopup`, `PredPopup`, `Popup` (shared shell)

- **`ganttUtils.ts`** — pure utility functions
  - `calcEndDate(start, md, holidays)` — คำนวณ end date จาก working days
  - `calcStartDate(end, md, holidays)` — ย้อนกลับ
  - `firstWorkingDay(date, holidays)` — หา working day แรก
  - `dateToPixel()`, `pixelToDate()` — แปลง date ↔ pixel position
  - `isHoliday()`, `isWeekdayOff()`, `isSpecialHoliday()`

- **`useProjectStore.ts`** — Zustand store
  - `updateTask(id, updates)` — update task ใน store
  - `setProject(project)` — set current project
  - `getTaskRoleMD(task)` — คืน effective roleMD (auto/calmd/manual)

- **`useProjectData.ts`** — load data จาก API เข้า store
  - `transformTask()` — map API response → Task type (startDate/endDate จาก ISO → YYYY-MM-DD)

### Backend
- **`tasks.service.ts`** — `toDateTime()` แปลง YYYY-MM-DD → Date ก่อนส่ง Prisma
- **`projects.service.ts`** — `toDateTime()` เหมือนกัน + `duplicate()` สำหรับ copy project

---

## Database Schema (สำคัญ)

```prisma
model Task {
  startDate    DateTime?  // actual start (set in Plan tab)
  endDate      DateTime?  // auto-calculated
  dependencies Json       // [{taskId, type: "FS"|"FF"|"SS"|"SF", lag: 0}]
}

model Project {
  startDate    DateTime?
  holidayConfig Json      // {weekdays:[0,6], specialDates:[], specialColor:'#fef3c7'}
}
```

Migration ที่สำคัญ: `20260320000000_plan_v2` — เพิ่ม startDate/endDate/holidayConfig

---

## Environment Variables

**Backend** (`Backend/.env` — ต้องสร้างเองไม่ได้ commit):
```
DATABASE_URL="postgresql://postgres:1234@localhost:5432/iplanning?schema=public"
PORT=3001
NODE_ENV=development
```

**Frontend** — ไม่มี `.env` พิเศษ, API URL hardcode ที่ `api.ts` → `http://localhost:3001`

---

## Run Commands

```bash
# Backend
cd Backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev

# Frontend (terminal ใหม่)
cd Frontend
npm install
npm run dev
```

---

## Gantt Chart — สิ่งสำคัญที่ต้องรู้

### Dependency Types
- **FS** (Finish→Start): Task B เริ่มหลัง Task A จบ (default)
- **FF** (Finish→Finish): Task B จบพร้อม Task A
- **SS** (Start→Start): Task B เริ่มพร้อม Task A
- **SF** (Start→Finish): Task B จบก่อน Task A เริ่ม

### Lag
- บวก = delay (เว้นระยะ)
- ลบ = overlap (ซ้อนทับ)

### Predecessor Direction (ลาก connector)
- **หัว** = Start point ของ Task
- **ท้าย** = Finish point ของ Task
- ลากจาก **ท้าย A → หัว B** = B มี predecessor 1FS (FS บน Task B, pred = A)
- PRED field แสดงบน **successor** (Task ที่ถูกบังคับ)

### Layout Constants
```ts
LEFT_W = 466  // left panel width (px)
DAY_W  = 30   // week zoom: 1 day width
WEEK_W = 30   // month zoom: 1 week width
MONTH_W = 40  // year zoom: 1 month width
HDR_H  = 48   // header height
TASK_H = 32   // task row height
PHASE_H = 28  // phase row height
```

---

## Patterns & Conventions

- **saveTask()** — ทุก API save ผ่าน `saveTask()` เท่านั้น (debounce 600ms + toast error)
- **cascadeRef** — ใช้ ref เพื่อเรียก `cascadeSuccessors` จากใน drag useEffect
- **Popup vs Modal** — ทุก popup ใช้ `<Popup>` shell (position:fixed, flip above/below)
  - Modal จริงๆ มีแค่ AutoSet confirm (center screen, dark backdrop)
- **CSS Variables** — `var(--accent)`, `var(--text)`, `var(--s1)`, `var(--border)`, `var(--orange)`
- **toISODate()** — ใช้เสมอเวลาแปลง Date → string (YYYY-MM-DD)
- **No `node_modules/` in git** — ต้อง `npm install` ทุกเครื่อง

---

## GitHub Repos
- Frontend: `https://github.com/noppharatphonthong2538/iplanning-frontend`
- Backend: `https://github.com/noppharatphonthong2538/iplanning-backend`
