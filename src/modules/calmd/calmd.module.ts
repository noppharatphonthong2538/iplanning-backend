import { Module } from '@nestjs/common';
import { CalmdController } from './calmd.controller';
import { CalmdService } from './calmd.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [CalmdController],
  providers: [CalmdService, PrismaService],
  exports: [CalmdService],
})
export class CalmdModule {}
