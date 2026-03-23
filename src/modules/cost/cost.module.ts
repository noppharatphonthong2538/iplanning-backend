import { Module } from '@nestjs/common';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [CostController],
  providers: [CostService, PrismaService],
})
export class CostModule {}
