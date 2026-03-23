import { Module } from '@nestjs/common';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [RequirementsController],
  providers: [RequirementsService, PrismaService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
