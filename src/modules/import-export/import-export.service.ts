import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildXlsx, parseXlsx, XlsxSheet } from '../../utils/xlsx-util';
import { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type SheetType = 'requirements' | 'stdmd' | 'tasks' | 'calmd';

export interface ImportResult {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MD Calculation helpers  (mirrors frontend store logic)
// ─────────────────────────────────────────────────────────────────────────────

type AnyTask   = { id: string; taskMode: string; phaseId: string; featureType: string; roleMD: any; activeRoles: any };
type StdRow    = { type: string; roleMD: any };
type CalRole   = { role: string; items: { linkedTaskId: string | null; baseScope: string; type: string; value: number }[] };

/** Effective roleMD for one task — same algorithm as frontend _rawTaskRoleMD */
function rawTaskRoleMD(t: AnyTask, stdMd: StdRow[]): Record<string, number> {
  // auto mode (or legacy feature mode): derive MD from featureType in StdMD
  if (t.featureType && (t.taskMode === 'auto' || t.taskMode === 'feature')) {
    const row = stdMd.find((r) => r.type === t.featureType);
    if (row) {
      const base: Record<string, number> = {};
      for (const [r, v] of Object.entries(row.roleMD as Record<string, number>)) {
        if ((v || 0) > 0) base[r] = v;
      }
      if (Array.isArray(t.activeRoles)) {
        const out: Record<string, number> = {};
        (t.activeRoles as string[]).forEach((r) => { out[r] = base[r] || 0; });
        return out;
      }
      return base;
    }
  }
  return (t.roleMD as Record<string, number>) || {};
}

/** Sum of auto-task roleMD for a role (base for Cal MD % calculations), optionally scoped to a phase */
function devBaseMD(role: string, tasks: AnyTask[], stdMd: StdRow[], phaseId?: string): number {
  return tasks
    .filter((t) => (t.taskMode === 'auto' || t.taskMode === 'feature') && (!phaseId || t.phaseId === phaseId))
    .reduce((s, t) => s + (rawTaskRoleMD(t, stdMd)[role] || 0), 0);
}

/** If this task is linked by a Cal MD item for the given role, return that calculated value */
function getCalMdLink(
  taskId: string, role: string,
  calMd: CalRole[], tasks: AnyTask[], stdMd: StdRow[],
): number | null {
  for (const rd of calMd) {
    if (rd.role !== role) continue;
    for (const it of rd.items) {
      if (it.linkedTaskId === taskId) {
        const phaseId = (!it.baseScope || it.baseScope === 'all') ? undefined : it.baseScope;
        const base = devBaseMD(role, tasks, stdMd, phaseId);
        return (it.type === 'pct' || it.type === 'addon') ? base * it.value / 100 : it.value;
      }
    }
  }
  return null;
}

/** Effective displayed roleMD — mirrors frontend getTaskRoleMD */
function effectiveRoleMD(
  task: AnyTask,
  stdMd: StdRow[],
  calMd: CalRole[],
  tasks: AnyTask[],
): Record<string, number> {
  const raw = rawTaskRoleMD(task, stdMd);
  const out: Record<string, number> = {};

  for (const [r, m] of Object.entries(raw)) {
    const linked = getCalMdLink(task.id, r, calMd, tasks, stdMd);
    out[r] = linked !== null ? linked : m;
  }

  // Also include Cal MD roles not in base
  for (const rd of calMd) {
    for (const it of rd.items) {
      if (it.linkedTaskId === task.id && !(rd.role in out)) {
        const phaseId = (!it.baseScope || it.baseScope === 'all') ? undefined : it.baseScope;
        const base = devBaseMD(rd.role, tasks, stdMd, phaseId);
        out[rd.role] = (it.type === 'pct' || it.type === 'addon') ? base * it.value / 100 : it.value;
      }
    }
  }

  return Object.keys(out).length ? out : raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_COL = '_action';

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 1) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim(); });
    return obj;
  });
}

function parseAction(v: string): 'add' | 'update' | 'delete' | 'upsert' {
  const s = (v ?? '').toLowerCase().trim();
  if (s === 'add') return 'add';
  if (s === 'update') return 'update';
  if (s === 'delete') return 'delete';
  return 'upsert';
}

function parseNum(v: string | undefined): number {
  const n = parseFloat(v ?? '');
  return isNaN(n) ? 0 : n;
}

function splitCodes(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class ImportExportService {
  constructor(private prisma: PrismaService) {}
  private get db(): any { return this.prisma; }

  // ═══════════════════════════════════════════
  // ROLES helper
  // ═══════════════════════════════════════════
  private async getRoles(projectId: string): Promise<string[]> {
    const rows = await this.db.roleConfig.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
    return (rows as any[]).map((r: any) => r.name as string);
  }

  // ═══════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════
  async exportSheet(projectId: string, sheet: SheetType): Promise<Buffer> {
    switch (sheet) {
      case 'requirements': return this.exportRequirements(projectId);
      case 'stdmd':        return this.exportStdMd(projectId);
      case 'tasks':        return this.exportTasks(projectId);
      case 'calmd':        return this.exportCalMd(projectId);
    }
  }

  // ── Requirements ──
  private async exportRequirements(projectId: string): Promise<Buffer> {
    const rows = await this.prisma.requirement.findMany({
      where: { projectId }, orderBy: { sortOrder: 'asc' },
    });
    const header = [ACTION_COL, 'reqNo', 'text', 'source', 'sortOrder'];
    const dataRows = rows.map((r) => [
      '', r.reqNo, r.text, r.source, r.sortOrder,
    ] as (string | number | null)[]);

    const sheet: XlsxSheet = {
      name: 'Requirements',
      rows: [header, ...dataRows],
    };
    return buildXlsx([sheet, this.helpSheet('requirements')]);
  }

  // ── StdMD ──
  // Canonical group display order (mirrors frontend stdMdGroups default)
  private static readonly STD_MD_GROUPS = ['Screen', 'Feature', 'Report', 'Log', 'Integration', 'Document'];

  private async exportStdMd(projectId: string): Promise<Buffer> {
    const roles = await this.getRoles(projectId);
    const rows = await this.prisma.stdMdRow.findMany({
      where: { projectId }, orderBy: { sortOrder: 'asc' },
    });

    // Sort to match screen display order: group position first, then sortOrder within each group.
    // This handles cases where new rows are appended globally (sortOrder = total count)
    // instead of being inserted in group-correct position.
    const groupIdx = (g: string) => {
      const i = ImportExportService.STD_MD_GROUPS.indexOf(g);
      return i >= 0 ? i : ImportExportService.STD_MD_GROUPS.length; // unknown groups go last
    };
    rows.sort((a, b) => {
      const gd = groupIdx(a.group) - groupIdx(b.group);
      return gd !== 0 ? gd : a.sortOrder - b.sortOrder;
    });
    const mdCols = roles.map((r) => `md_${r}`);
    const header = [ACTION_COL, 'stdCode', 'group', 'type', ...mdCols, 'sortOrder'];
    const dataRows = rows.map((r) => {
      const md = (r.roleMD ?? {}) as Record<string, number>;
      return [
        '', r.stdCode, r.group, r.type,
        ...roles.map((role) => md[role] ?? 0),
        r.sortOrder,
      ] as (string | number | null)[];
    });

    const sheet: XlsxSheet = {
      name: 'StdMD',
      rows: [header, ...dataRows],
    };
    return buildXlsx([sheet, this.helpSheet('stdmd', roles)]);
  }

  // ── Tasks ──
  private async exportTasks(projectId: string): Promise<Buffer> {
    const roles = await this.getRoles(projectId);

    const [tasks, phases, requirements, stdMdRows, calMdRoles] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        include: { requirements: { select: { requirementId: true } } },
      }),
      this.prisma.phase.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.requirement.findMany({ where: { projectId } }),
      this.prisma.stdMdRow.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.calMdRole.findMany({
        where: { projectId },
        include: { items: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const phaseMap     = new Map(phases.map((p) => [p.id, p.phaseCode]));
    const phaseCodeMap = new Map(phases.map((p) => [p.id, p.phaseCode])); // same as phaseMap
    const reqMap       = new Map(requirements.map((r) => [r.id, r.reqNo]));
    const taskMap      = new Map(tasks.map((t) => [t.id, t.taskCode]));

    // Cast to our helper types
    const anyTasks = tasks  as unknown as AnyTask[];
    const anyStdMd = stdMdRows as unknown as StdRow[];
    const anyCalMd = calMdRoles as unknown as CalRole[];

    // ── Sort by phaseCode → taskCode (natural sort) ──
    const sortedTasks = [...tasks].sort((a, b) => {
      const pc = (phaseCodeMap.get(a.phaseId) ?? '').localeCompare(phaseCodeMap.get(b.phaseId) ?? '', undefined, { numeric: true });
      if (pc !== 0) return pc;
      return a.taskCode.localeCompare(b.taskCode, undefined, { numeric: true });
    });

    const mdCols = roles.map((r) => `md_${r}`);
    const header = [
      ACTION_COL, 'phaseCode', 'taskCode', 'type', 'name',
      'featureGroup', 'featureType', 'taskMode',
      ...mdCols,
      'startWeek', 'endWeek', 'reqRefs', 'dependencies',
    ];

    const dataRows = sortedTasks.map((t) => {
      // Use effectiveRoleMD so values match what the UI displays
      const md   = effectiveRoleMD(t as unknown as AnyTask, anyStdMd, anyCalMd, anyTasks);
      const deps = ((t.dependencies ?? []) as any[]).map((d: any) => {
        const taskId = typeof d === 'string' ? d : d.taskId;
        const code = taskMap.get(taskId) ?? taskId;
        const type = typeof d === 'string' ? 'FS' : (d.type ?? 'FS');
        const lag  = typeof d === 'string' ? 0 : (d.lag ?? 0);
        return lag !== 0 ? `${code}(${type}${lag > 0 ? '+' : ''}${lag})` : `${code}(${type})`;
      }).join(',');
      const reqs = t.requirements.map((r) => reqMap.get(r.requirementId) ?? r.requirementId).join(',');
      return [
        '', phaseMap.get(t.phaseId) ?? '', t.taskCode,
        t.type, t.name, t.featureGroup, t.featureType, t.taskMode,
        ...roles.map((role) => {
          const v = md[role];
          // Export as blank (null) when task has no MD for that role
          if (!v || v === 0) return null;
          return Math.round(v * 100) / 100;
        }),
        t.startWeek, t.endWeek, reqs, deps,
      ] as (string | number | null)[];
    });

    const taskSheet: XlsxSheet = {
      name: 'Tasks',
      rows: [header, ...dataRows],
    };

    // ── Phases sheet — lets users add / edit phases from the same file ──
    const phaseHeader = [ACTION_COL, 'phaseCode', 'name', 'color'];
    const phaseRows = phases.map((p) => ['', p.phaseCode, p.name, p.color] as (string | null)[]);
    const phaseSheet: XlsxSheet = { name: 'Phases', rows: [phaseHeader, ...phaseRows] };

    return buildXlsx([phaseSheet, taskSheet, this.helpSheet('tasks', roles)]);
  }

  // ── CalMD ──
  private async exportCalMd(projectId: string): Promise<Buffer> {
    const [roles, phases, tasks] = await Promise.all([
      this.prisma.calMdRole.findMany({
        where: { projectId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.phase.findMany({ where: { projectId } }),
      this.prisma.task.findMany({ where: { projectId } }),
    ]);

    const phaseMap = new Map(phases.map((p) => [p.id, p.phaseCode]));
    const taskMap  = new Map(tasks.map((t) => [t.id, t.taskCode]));

    const header = [ACTION_COL, 'role', 'itemName', 'value', 'type', 'baseScope', 'linkedTask', 'sortOrder'];
    const dataRows: (string | number | null)[][] = [];

    for (const role of roles) {
      for (const item of role.items) {
        const bs = !item.baseScope || item.baseScope === 'all'
          ? 'all' : (phaseMap.get(item.baseScope) ?? item.baseScope);
        const lt = item.linkedTaskId ? (taskMap.get(item.linkedTaskId) ?? '') : '';
        dataRows.push([
          '', role.role, item.name, item.value,
          item.type, bs, lt, item.sortOrder,
        ]);
      }
    }

    const sheet: XlsxSheet = { name: 'CalMD', rows: [header, ...dataRows] };
    return buildXlsx([sheet, this.helpSheet('calmd')]);
  }

  // ── Help Sheet ──
  private helpSheet(type: SheetType, roles?: string[]): XlsxSheet {
    const mdNote = roles?.length
      ? `md_{role} columns (${roles.map((r) => `md_${r}`).join(', ')}): manual mode only — feature/derived mode calculates automatically`
      : '';
    const lines: Record<SheetType, string[]> = {
      requirements: [
        '_action: add | update | delete | (blank = upsert)',
        'reqNo: unique code e.g. R_001  [KEY]',
        'text: requirement description',
        'source: source name',
        'sortOrder: integer (auto-assigned if blank)',
      ],
      stdmd: [
        '_action: add | update | delete | (blank = upsert)',
        'stdCode: unique code e.g. SM01  [KEY]',
        'group: feature group name',
        'type: feature type name',
        mdNote,
        'sortOrder: integer',
      ].filter(Boolean),
      tasks: [
        '=== Phases sheet (processed first) ===',
        '_action: add | update | delete | (blank = upsert)',
        'phaseCode: unique phase code e.g. T01  [KEY]',
        'name: phase display name',
        'color: hex color e.g. #3b82f6',
        '',
        '=== Tasks sheet ===',
        '_action: add | update | delete | (blank = upsert)',
        'phaseCode: phase code e.g. T01  [required for add — create in Phases sheet first]',
        'taskCode: unique code e.g. T01-01  [KEY]',
        'type: Task | Deliverable | Milestone',
        'name: task name',
        'featureGroup / featureType: group and std type name (e.g. "High Complex Feature")',
        'taskMode: manual | auto | calmd | allocate',
        mdNote,
        'startWeek / endWeek: week numbers',
        'reqRefs: comma-separated reqNo  e.g. R_001,R_002',
        'dependencies: comma-separated taskCode',
      ].filter(Boolean),
      calmd: [
        '_action: add | update | delete | (blank = upsert)',
        'role: CalMD role name  [KEY part 1]',
        'itemName: item name  [KEY part 2]',
        'value: number',
        'type: pct | addon | fixed',
        'baseScope: all | phaseCode',
        'linkedTask: taskCode or blank',
        'sortOrder: integer',
      ],
    };

    return {
      name: 'Help',
      rows: [
        ['Field Guide'],
        [],
        ...lines[type].map((l) => [l]),
      ],
    };
  }

  // ═══════════════════════════════════════════
  // IMPORT
  // ═══════════════════════════════════════════
  async importSheet(
    projectId: string,
    sheet: SheetType,
    fileBuffer: Buffer,
  ): Promise<ImportResult> {
    const parsed = parseXlsx(fileBuffer);
    // Find the matching sheet (case-insensitive)
    const sheetNames: Record<SheetType, string> = {
      requirements: 'Requirements',
      stdmd: 'StdMD',
      tasks: 'Tasks',
      calmd: 'CalMD',
    };
    const targetName = sheetNames[sheet];
    const rows =
      parsed[targetName] ??
      parsed[Object.keys(parsed).find((k) => k.toLowerCase() === targetName.toLowerCase()) ?? ''] ??
      null;

    if (!rows) {
      throw new BadRequestException(
        `ไม่พบ sheet "${targetName}" ในไฟล์ที่อัพโหลด (พบ: ${Object.keys(parsed).join(', ')})`,
      );
    }

    if (sheet === 'tasks') {
      // Process Phases sheet first (if present) so new phases are available for task rows
      const phaseRows =
        parsed['Phases'] ??
        parsed[Object.keys(parsed).find((k) => k.toLowerCase() === 'phases') ?? ''] ??
        null;
      const phaseResult = phaseRows
        ? await this.importPhasesFromRows(projectId, phaseRows)
        : { added: 0, updated: 0, deleted: 0, errors: [] };

      const taskResult = await this.importTasks(projectId, rows);

      // Merge results: surface phase errors alongside task errors
      return {
        added:   phaseResult.added   + taskResult.added,
        updated: phaseResult.updated + taskResult.updated,
        deleted: phaseResult.deleted + taskResult.deleted,
        errors:  [
          ...phaseResult.errors.map((e) => `[Phases] ${e}`),
          ...taskResult.errors,
        ],
      };
    }

    switch (sheet) {
      case 'requirements': return this.importRequirements(projectId, rows);
      case 'stdmd':        return this.importStdMd(projectId, rows);
      case 'calmd':        return this.importCalMd(projectId, rows);
    }
  }

  // ── Import: Phases (used as pre-pass when importing the Tasks file) ──
  private async importPhasesFromRows(projectId: string, rows: string[][]): Promise<ImportResult> {
    const objs = rowsToObjects(rows);
    const result: ImportResult = { added: 0, updated: 0, deleted: 0, errors: [] };

    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const rowLabel = `Row ${i + 2}`;
      const action    = parseAction(obj[ACTION_COL]);
      const phaseCode = obj['phaseCode'];
      if (!phaseCode) { result.errors.push(`${rowLabel}: phaseCode ว่าง — ข้ามแถว`); continue; }

      try {
        const existing = await this.prisma.phase.findUnique({
          where: { projectId_phaseCode: { projectId, phaseCode } },
        });

        if (action === 'delete') {
          if (!existing) { result.errors.push(`${rowLabel}: ไม่พบ phaseCode "${phaseCode}"`); continue; }
          await this.prisma.phase.delete({ where: { id: existing.id } });
          result.deleted++;
          continue;
        }

        if (action === 'add' && existing) {
          result.errors.push(`${rowLabel}: phaseCode "${phaseCode}" มีอยู่แล้ว`);
          continue;
        }
        if (action === 'update' && !existing) {
          result.errors.push(`${rowLabel}: ไม่พบ phaseCode "${phaseCode}" สำหรับ update`);
          continue;
        }

        const data: any = {};
        if (obj['name']  !== undefined && obj['name']  !== '') data.name  = obj['name'];
        if (obj['color'] !== undefined && obj['color'] !== '') data.color = obj['color'];
        // Always sync sortOrder from row position so re-importing fixes existing order
        data.sortOrder = i;

        if (existing) {
          await this.prisma.phase.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          await this.prisma.phase.create({
            data: {
              projectId,
              phaseCode,
              name:      data.name  ?? phaseCode,
              color:     data.color ?? '#3b82f6',
              sortOrder: i,
            },
          });
          result.added++;
        }
      } catch (err: any) {
        result.errors.push(`${rowLabel}: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`);
      }
    }
    return result;
  }

  // ── Import: Requirements ──
  private async importRequirements(projectId: string, rows: string[][]): Promise<ImportResult> {
    const objs = rowsToObjects(rows);
    const result: ImportResult = { added: 0, updated: 0, deleted: 0, errors: [] };

    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const rowLabel = `Row ${i + 2}`;
      const action = parseAction(obj[ACTION_COL]);
      const reqNo = obj['reqNo'];
      if (!reqNo) { result.errors.push(`${rowLabel}: reqNo ว่าง — ข้ามแถว`); continue; }

      try {
        const existing = await this.prisma.requirement.findUnique({
          where: { projectId_reqNo: { projectId, reqNo } },
        });

        if (action === 'delete') {
          if (!existing) { result.errors.push(`${rowLabel}: ไม่พบ reqNo "${reqNo}"`); continue; }
          await this.prisma.requirement.delete({ where: { id: existing.id } });
          result.deleted++;
          continue;
        }

        if (action === 'add' && existing) {
          result.errors.push(`${rowLabel}: reqNo "${reqNo}" มีอยู่แล้ว (ใช้ update หรือ upsert)`);
          continue;
        }
        if (action === 'update' && !existing) {
          result.errors.push(`${rowLabel}: ไม่พบ reqNo "${reqNo}" สำหรับ update`);
          continue;
        }

        const data: any = {};
        if (obj['text'] !== undefined && obj['text'] !== '')   data.text   = obj['text'];
        if (obj['source'] !== undefined && obj['source'] !== '') data.source = obj['source'];
        if (obj['sortOrder'] && obj['sortOrder'] !== '') data.sortOrder = parseInt(obj['sortOrder'], 10);

        if (existing) {
          await this.prisma.requirement.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          // Get next sortOrder
          if (data.sortOrder === undefined) {
            const max = await this.prisma.requirement.aggregate({
              where: { projectId }, _max: { sortOrder: true },
            });
            data.sortOrder = (max._max.sortOrder ?? -1) + 1;
          }
          await this.prisma.requirement.create({
            data: { projectId, reqNo, text: obj['text'] ?? '', source: obj['source'] ?? '', ...data },
          });
          result.added++;
        }
      } catch (e: any) {
        result.errors.push(`${rowLabel}: ${e?.message ?? String(e)}`);
      }
    }
    return result;
  }

  // ── Import: StdMD ──
  private async importStdMd(projectId: string, rows: string[][]): Promise<ImportResult> {
    const objs = rowsToObjects(rows);
    const result: ImportResult = { added: 0, updated: 0, deleted: 0, errors: [] };
    const roles = await this.getRoles(projectId);

    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const rowLabel = `Row ${i + 2}`;
      const action = parseAction(obj[ACTION_COL]);
      const stdCode = obj['stdCode'];
      if (!stdCode) { result.errors.push(`${rowLabel}: stdCode ว่าง — ข้ามแถว`); continue; }

      try {
        const existing = await this.prisma.stdMdRow.findUnique({
          where: { projectId_stdCode: { projectId, stdCode } },
        });

        if (action === 'delete') {
          if (!existing) { result.errors.push(`${rowLabel}: ไม่พบ stdCode "${stdCode}"`); continue; }
          await this.prisma.stdMdRow.delete({ where: { id: existing.id } });
          result.deleted++;
          continue;
        }

        if (action === 'add' && existing) {
          result.errors.push(`${rowLabel}: stdCode "${stdCode}" มีอยู่แล้ว`);
          continue;
        }
        if (action === 'update' && !existing) {
          result.errors.push(`${rowLabel}: ไม่พบ stdCode "${stdCode}" สำหรับ update`);
          continue;
        }

        // Build roleMD from md_{role} columns
        const roleMD: Record<string, number> = existing
          ? ({ ...(existing.roleMD as object) } as Record<string, number>)
          : {};
        for (const role of roles) {
          const col = `md_${role}`;
          if (obj[col] !== undefined && obj[col] !== '') roleMD[role] = parseNum(obj[col]);
        }

        const data: any = { roleMD };
        if (obj['group'] !== undefined && obj['group'] !== '') data.group = obj['group'];
        if (obj['type'] !== undefined && obj['type'] !== '')  data.type  = obj['type'];
        if (obj['sortOrder'] && obj['sortOrder'] !== '') data.sortOrder = parseInt(obj['sortOrder'], 10);

        if (existing) {
          await this.prisma.stdMdRow.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          if (data.sortOrder === undefined) {
            const max = await this.prisma.stdMdRow.aggregate({
              where: { projectId }, _max: { sortOrder: true },
            });
            data.sortOrder = (max._max.sortOrder ?? -1) + 1;
          }
          await this.prisma.stdMdRow.create({
            data: { projectId, stdCode, group: obj['group'] ?? '', type: obj['type'] ?? '', ...data },
          });
          result.added++;
        }
      } catch (e: any) {
        result.errors.push(`${rowLabel}: ${e?.message ?? String(e)}`);
      }
    }
    return result;
  }

  // ── Import: Tasks ──
  private async importTasks(projectId: string, rows: string[][]): Promise<ImportResult> {
    const objs = rowsToObjects(rows);
    const result: ImportResult = { added: 0, updated: 0, deleted: 0, errors: [] };
    const roles = await this.getRoles(projectId);

    // Pre-fetch lookup maps
    const [phases, requirements, allTasks] = await Promise.all([
      this.prisma.phase.findMany({ where: { projectId } }),
      this.prisma.requirement.findMany({ where: { projectId } }),
      this.prisma.task.findMany({ where: { projectId } }),
    ]);
    const phaseByCode = new Map(phases.map((p) => [p.phaseCode, p]));
    const reqByCode   = new Map(requirements.map((r) => [r.reqNo, r]));
    const taskByCode  = new Map(allTasks.map((t) => [t.taskCode, t]));

    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const rowLabel = `Row ${i + 2}`;
      const action   = parseAction(obj[ACTION_COL]);
      const taskCode = obj['taskCode'];
      if (!taskCode) { result.errors.push(`${rowLabel}: taskCode ว่าง — ข้ามแถว`); continue; }

      try {
        const existing = taskByCode.get(taskCode) ??
          await this.prisma.task.findUnique({ where: { projectId_taskCode: { projectId, taskCode } } });

        if (action === 'delete') {
          if (!existing) { result.errors.push(`${rowLabel}: ไม่พบ taskCode "${taskCode}"`); continue; }
          await this.prisma.task.delete({ where: { id: existing.id } });
          taskByCode.delete(taskCode);
          result.deleted++;
          continue;
        }

        if (action === 'add' && existing) {
          result.errors.push(`${rowLabel}: taskCode "${taskCode}" มีอยู่แล้ว`);
          continue;
        }
        if (action === 'update' && !existing) {
          result.errors.push(`${rowLabel}: ไม่พบ taskCode "${taskCode}" สำหรับ update`);
          continue;
        }

        // ── Determine effective taskMode (from row or existing) ──
        const taskModeVal = (obj['taskMode'] && obj['taskMode'] !== '')
          ? obj['taskMode']
          : (existing?.taskMode ?? 'manual');
        const featureTypeVal = obj['featureType'] !== undefined ? obj['featureType'] : (existing?.featureType ?? '');

        // ── roleMD: applies to manual / calmd / allocate modes ──
        // For auto mode → MD comes from stdMd lookup (ignore md_ columns)
        // For calmd/allocate → md_ columns store fallback values; CalMD links override at display time
        // For manual → md_ columns are the actual stored values
        let roleMD: Record<string, number> | undefined;
        if (taskModeVal === 'manual' || taskModeVal === 'calmd' || taskModeVal === 'allocate') {
          roleMD = existing
            ? ({ ...(existing.roleMD as object) } as Record<string, number>)
            : {};
          for (const role of roles) {
            const col = `md_${role}`;
            if (obj[col] !== undefined) {
              if (obj[col] === '') {
                // Blank cell → remove this role from roleMD
                delete roleMD[role];
              } else {
                const v = parseNum(obj[col]);
                if (v > 0) roleMD[role] = v;
                else delete roleMD[role];  // zero or negative → remove
              }
            }
          }
        }

        // ── activeRoles for auto mode ──
        // If any md_ column exists in the file, rebuild activeRoles from non-blank, non-zero values.
        // Blank cell = explicitly exclude that role. Missing column = don't change.
        let activeRoles: string[] | null | undefined = undefined; // undefined = don't change
        if (taskModeVal === 'auto' || taskModeVal === 'feature') {
          const hasMdCols = roles.some((r) => obj[`md_${r}`] !== undefined);
          if (hasMdCols) {
            // Rebuild activeRoles based on which roles have a non-blank, non-zero md_ value
            const activeCols = roles.filter((r) => {
              const col = `md_${r}`;
              return obj[col] !== undefined && obj[col] !== '' && parseNum(obj[col]) > 0;
            });
            activeRoles = activeCols; // empty array = no active roles
          } else if (!existing) {
            activeRoles = null; // new task with no md_ columns, default = all roles from stdMd
          }
        }

        // reqRefs → IDs
        const reqCodes = splitCodes(obj['reqRefs'] ?? '');
        const reqIds: string[] = [];
        for (const code of reqCodes) {
          const req = reqByCode.get(code);
          if (!req) { result.errors.push(`${rowLabel}: ไม่พบ reqNo "${code}"`); }
          else reqIds.push(req.id);
        }

        // dependencies → Predecessor[]  format: "T01-01(FS+3),T02-01(FF)"
        const depRaw = splitCodes(obj['dependencies'] ?? '');
        const depPreds: any[] = [];
        for (const raw of depRaw) {
          const match = raw.match(/^([^(]+)(?:\(([A-Z]{2})([+-]\d+)?\))?$/);
          if (!match) continue;
          const code = match[1].trim();
          const type = (match[2] ?? 'FS') as 'FS' | 'FF' | 'SS' | 'SF';
          const lag  = match[3] ? parseInt(match[3], 10) : 0;
          const dep = taskByCode.get(code) ??
            await this.prisma.task.findUnique({ where: { projectId_taskCode: { projectId, taskCode: code } } });
          if (!dep) result.errors.push(`${rowLabel}: dependency taskCode "${code}" ไม่พบ`);
          else depPreds.push({ taskId: dep.id, type, lag });
        }

        const data: any = {};
        if (roleMD !== undefined) data.roleMD = roleMD;
        if (activeRoles !== undefined) data.activeRoles = activeRoles;
        if (obj['name'] !== undefined && obj['name'] !== '')  data.name  = obj['name'];
        if (obj['type'] !== undefined && obj['type'] !== '')  data.type  = obj['type'];
        if (obj['featureGroup'] !== undefined)                data.featureGroup = obj['featureGroup'];
        if (obj['featureType'] !== undefined)                 data.featureType  = obj['featureType'];
        if (obj['taskMode'] !== undefined && obj['taskMode'] !== '') data.taskMode = obj['taskMode'];
        if (obj['startWeek'] && obj['startWeek'] !== '') data.startWeek = parseInt(obj['startWeek'], 10);
        if (obj['endWeek'] && obj['endWeek'] !== '')   data.endWeek   = parseInt(obj['endWeek'], 10);
        if (depRaw.length > 0 || obj['dependencies'] === '') data.dependencies = depPreds;

        if (existing) {
          // Sync requirements junction
          if (reqCodes.length > 0 || obj['reqRefs'] === '') {
            await this.prisma.taskRequirement.deleteMany({ where: { taskId: existing.id } });
            if (reqIds.length > 0) {
              await this.prisma.taskRequirement.createMany({
                data: reqIds.map((rid) => ({ taskId: existing.id, requirementId: rid })),
              });
            }
          }
          await this.prisma.task.update({ where: { id: existing.id }, data });
          // Update taskByCode with refreshed task
          const updated = await this.prisma.task.findUnique({ where: { id: existing.id } });
          if (updated) taskByCode.set(taskCode, updated);
          result.updated++;
        } else {
          const phaseCode = obj['phaseCode'];
          if (!phaseCode) { result.errors.push(`${rowLabel}: phaseCode จำเป็นสำหรับ add`); continue; }
          const phase = phaseByCode.get(phaseCode);
          if (!phase) { result.errors.push(`${rowLabel}: ไม่พบ phaseCode "${phaseCode}"`); continue; }

          if (data.sortOrder === undefined) {
            const max = await this.prisma.task.aggregate({
              where: { projectId }, _max: { sortOrder: true },
            });
            data.sortOrder = (max._max.sortOrder ?? -1) + 1;
          }

          const newTask = await this.prisma.task.create({
            data: {
              projectId, phaseId: phase.id, taskCode,
              name: obj['name'] ?? '', type: (obj['type'] as any) ?? 'Task',
              featureGroup: obj['featureGroup'] ?? '',
              featureType:  featureTypeVal,
              taskMode: (taskModeVal as any) ?? 'manual',
              roleMD: (roleMD ?? {}) as any,
              activeRoles: (activeRoles !== undefined ? activeRoles : null) as any,
              dependencies: depPreds,
              startWeek: data.startWeek ?? 1,
              endWeek:   data.endWeek   ?? 1,
              sortOrder: data.sortOrder,
              requirements: reqIds.length
                ? { create: reqIds.map((rid) => ({ requirementId: rid })) }
                : undefined,
            },
          });
          taskByCode.set(taskCode, newTask);
          result.added++;
        }
      } catch (e: any) {
        result.errors.push(`${rowLabel}: ${e?.message ?? String(e)}`);
      }
    }
    return result;
  }

  // ── Import: CalMD ──
  private async importCalMd(projectId: string, rows: string[][]): Promise<ImportResult> {
    const objs = rowsToObjects(rows);
    const result: ImportResult = { added: 0, updated: 0, deleted: 0, errors: [] };

    const [roles, phases, tasks] = await Promise.all([
      this.prisma.calMdRole.findMany({
        where: { projectId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.phase.findMany({ where: { projectId } }),
      this.prisma.task.findMany({ where: { projectId } }),
    ]);

    const roleByName  = new Map(roles.map((r) => [r.role, r]));
    const phaseByCode = new Map(phases.map((p) => [p.phaseCode, p]));
    const taskByCode  = new Map(tasks.map((t) => [t.taskCode, t]));
    // item lookup: "role::itemName::baseScope" → item  (scope disambiguates same-name items across phases)
    const itemKey = (role: string, name: string, scope: string = 'all') => `${role}::${name}::${scope}`;
    const itemMap = new Map<string, { id: string; calMdRoleId: string }>();
    for (const role of roles) {
      for (const item of role.items) {
        itemMap.set(itemKey(role.role, item.name, item.baseScope ?? 'all'), { id: item.id, calMdRoleId: role.id });
      }
    }

    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const rowLabel  = `Row ${i + 2}`;
      const action    = parseAction(obj[ACTION_COL]);
      const roleName  = obj['role'];
      const itemName  = obj['itemName'];
      if (!roleName || !itemName) {
        result.errors.push(`${rowLabel}: role หรือ itemName ว่าง — ข้ามแถว`);
        continue;
      }

      try {
        // Resolve baseScope BEFORE lookup so we can build the correct key
        const bsRaw = (obj['baseScope'] ?? 'all').trim();
        let baseScope: string;
        if (!bsRaw || bsRaw === 'all') {
          baseScope = 'all';
        } else {
          const resolvedPhase = phaseByCode.get(bsRaw);
          if (!resolvedPhase) {
            result.errors.push(`${rowLabel}: ไม่พบ phaseCode "${bsRaw}" สำหรับ baseScope`);
            continue;
          }
          baseScope = resolvedPhase.id;
        }

        const key = itemKey(roleName, itemName, baseScope);
        const existing = itemMap.get(key);

        if (action === 'delete') {
          if (!existing) { result.errors.push(`${rowLabel}: ไม่พบ "${roleName} / ${itemName}" (scope: ${bsRaw})`); continue; }
          await this.prisma.calMdItem.delete({ where: { id: existing.id } });
          itemMap.delete(key);
          result.deleted++;
          continue;
        }

        if (action === 'add' && existing) {
          result.errors.push(`${rowLabel}: "${roleName} / ${itemName}" (scope: ${bsRaw}) มีอยู่แล้ว`);
          continue;
        }
        if (action === 'update' && !existing) {
          result.errors.push(`${rowLabel}: ไม่พบ "${roleName} / ${itemName}" (scope: ${bsRaw}) สำหรับ update`);
          continue;
        }

        // Resolve linkedTask
        const ltCode = (obj['linkedTask'] ?? '').trim();
        const linkedTaskId = ltCode ? (taskByCode.get(ltCode)?.id ?? (() => {
          result.errors.push(`${rowLabel}: ไม่พบ taskCode "${ltCode}" สำหรับ linkedTask`);
          return null;
        })()) : null;

        const data: any = {};
        if (obj['value'] !== undefined && obj['value'] !== '') data.value = parseNum(obj['value']);
        if (obj['type'] !== undefined && obj['type'] !== '')   data.type  = obj['type'];
        data.baseScope    = baseScope;
        data.linkedTaskId = linkedTaskId;
        if (obj['sortOrder'] && obj['sortOrder'] !== '') data.sortOrder = parseInt(obj['sortOrder'], 10);

        if (existing) {
          await this.prisma.calMdItem.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          // Ensure CalMdRole exists
          let role = roleByName.get(roleName);
          if (!role) {
            const maxRole = await this.prisma.calMdRole.aggregate({
              where: { projectId }, _max: { sortOrder: true },
            });
            const newRole = await this.prisma.calMdRole.create({
              data: { projectId, role: roleName, sortOrder: (maxRole._max.sortOrder ?? -1) + 1 },
              include: { items: true },
            });
            role = newRole as any;
            roleByName.set(roleName, role!);
          }

          if (data.sortOrder === undefined) {
            const maxItem = await this.prisma.calMdItem.aggregate({
              where: { calMdRoleId: role!.id }, _max: { sortOrder: true },
            });
            data.sortOrder = (maxItem._max.sortOrder ?? -1) + 1;
          }

          const newItem = await this.prisma.calMdItem.create({
            data: {
              calMdRoleId: role!.id,
              name: itemName,
              value: data.value ?? 0,
              type: data.type ?? 'pct',
              baseScope: data.baseScope,
              linkedTaskId: data.linkedTaskId,
              sortOrder: data.sortOrder,
            },
          });
          itemMap.set(key, { id: newItem.id, calMdRoleId: role!.id });
          result.added++;
        }
      } catch (e: any) {
        result.errors.push(`${rowLabel}: ${e?.message ?? String(e)}`);
      }
    }
    return result;
  }
}
