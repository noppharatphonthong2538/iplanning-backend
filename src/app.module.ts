import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RequirementsModule } from './modules/requirements/requirements.module';
import { PhasesModule } from './modules/phases/phases.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StdmdModule } from './modules/stdmd/stdmd.module';
import { CalmdModule } from './modules/calmd/calmd.module';
import { CostModule } from './modules/cost/cost.module';
import { SourcesModule } from './modules/sources/sources.module';
import { RolesModule } from './modules/roles/roles.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { ImportExportModule } from './modules/import-export/import-export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ProjectsModule,
    RequirementsModule,
    PhasesModule,
    TasksModule,
    StdmdModule,
    CalmdModule,
    CostModule,
    SourcesModule,
    RolesModule,
    ResourcesModule,
    ImportExportModule,
  ],
})
export class AppModule {}
