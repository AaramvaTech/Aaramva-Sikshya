import { Global, Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/** Global so CalendarService (working-day query surface, Phase 3) is
 *  injectable from finance (late-fee, Phase 4) and attendance (Phase 5)
 *  without either of those modules importing CalendarModule — same
 *  rationale as StudentModule's @Global() for GuardianScopeService. */
@Global()
@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
