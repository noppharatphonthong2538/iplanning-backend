import { Module } from '@nestjs/common';
import { StdmdController } from './stdmd.controller';
import { StdmdService } from './stdmd.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [StdmdController],
  providers: [StdmdService, PrismaService],
  exports: [StdmdService],
})
export class StdmdModule {}
