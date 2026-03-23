import {
  Controller, Get, Post, Param, Res, Body,
  HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ImportExportService, SheetType, ImportResult } from './import-export.service';

const VALID_SHEETS: SheetType[] = ['requirements', 'stdmd', 'tasks', 'calmd'];

@Controller('projects/:projectId')
export class ImportExportController {
  constructor(private readonly svc: ImportExportService) {}

  // ── Export ──────────────────────────────────────────────────────────────
  // GET /api/projects/:projectId/export/:sheet
  @Get('export/:sheet')
  async exportSheet(
    @Param('projectId') projectId: string,
    @Param('sheet') sheet: string,
    @Res() res: Response,
  ) {
    if (!VALID_SHEETS.includes(sheet as SheetType)) {
      throw new BadRequestException(`Invalid sheet: ${sheet}`);
    }
    const buf = await this.svc.exportSheet(projectId, sheet as SheetType);
    const filename = `${sheet}-export.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    });
    res.end(buf);
  }

  // ── Import ──────────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/import/:sheet
  // Body: { "data": "<base64-encoded xlsx>" }
  @Post('import/:sheet')
  @HttpCode(HttpStatus.OK)
  async importSheet(
    @Param('projectId') projectId: string,
    @Param('sheet') sheet: string,
    @Body() body: { data?: string },
  ): Promise<ImportResult> {
    if (!VALID_SHEETS.includes(sheet as SheetType)) {
      throw new BadRequestException(`Invalid sheet: ${sheet}`);
    }
    if (!body?.data) {
      throw new BadRequestException('ต้องส่ง { "data": "<base64>" }');
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(body.data, 'base64');
    } catch {
      throw new BadRequestException('base64 ไม่ถูกต้อง');
    }

    if (!fileBuffer.length) {
      throw new BadRequestException('ไม่พบข้อมูลไฟล์');
    }

    return this.svc.importSheet(projectId, sheet as SheetType, fileBuffer);
  }
}
