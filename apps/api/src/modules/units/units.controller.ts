import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { CreateUnitDto, UpdateUnitDto } from './units.dto';
import { UnitsService } from './units.service';

@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  list() {
    return this.units.list();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUnitDto) {
    return this.units.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUnitDto) {
    return this.units.update(id, dto);
  }
}
