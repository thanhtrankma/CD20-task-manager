import { Global, Module } from '@nestjs/common';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Global()
@Module({
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
