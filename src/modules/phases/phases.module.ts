import { Module } from '@nestjs/common';
import { PhasesController } from './phases.controller';
import { PhasesService } from './phases.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [PhasesController],
  providers: [PhasesService, PrismaService],
  exports: [PhasesService],
})
export class PhasesModule {}
