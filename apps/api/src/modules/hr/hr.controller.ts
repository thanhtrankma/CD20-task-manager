import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { HrManager, Roles } from '../../common/decorators';
import {
  BalanceDto,
  CategoryDto,
  HolidayDto,
  HolidaysQuery,
  LeaveTypeDto,
  RolloverDto,
  SettingsDto,
  ShiftDto,
  StaffImportDto,
  StaffQuery,
  UnitShiftDto,
  UpdateCategoryDto,
  UpdateLeaveTypeDto,
  UpdateStaffDto,
} from './hr.dto';
import { HrService } from './hr.service';

/** Danh mục nghỉ phép, chấm công. Xem: mọi người (trừ quản trị); sửa: phụ trách nhân sự. */
@Controller('hr')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get('catalog')
  catalog() {
    return this.hr.catalog();
  }

  @Get('holidays')
  holidays(@Query() q: HolidaysQuery) {
    return this.hr.listHolidays(q.year);
  }

  @Post('categories') @HrManager()
  createCategory(@Body() dto: CategoryDto) {
    return this.hr.createCategory(dto);
  }

  @Patch('categories/:id') @HrManager()
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.hr.updateCategory(id, dto);
  }

  @Delete('categories/:id') @HrManager() @HttpCode(204)
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.hr.deleteCategory(id);
  }

  @Post('leave-types') @HrManager()
  createLeaveType(@Body() dto: LeaveTypeDto) {
    return this.hr.createLeaveType(dto);
  }

  @Patch('leave-types/:id') @HrManager()
  updateLeaveType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeaveTypeDto) {
    return this.hr.updateLeaveType(id, dto);
  }

  @Post('holidays') @HrManager()
  createHoliday(@Body() dto: HolidayDto) {
    return this.hr.createHoliday(dto);
  }

  @Delete('holidays/:id') @HrManager() @HttpCode(204)
  deleteHoliday(@Param('id', ParseIntPipe) id: number) {
    return this.hr.deleteHoliday(id);
  }

  @Post('shifts') @HrManager()
  createShift(@Body() dto: ShiftDto) {
    return this.hr.createShift(dto);
  }

  @Patch('shifts/:id') @HrManager()
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: ShiftDto) {
    return this.hr.updateShift(id, dto);
  }

  @Delete('shifts/:id') @HrManager() @HttpCode(204)
  deleteShift(@Param('id', ParseIntPipe) id: number) {
    return this.hr.deleteShift(id);
  }

  @Patch('units/:id/shift') @HrManager() @HttpCode(204)
  unitShift(@Param('id', ParseIntPipe) id: number, @Body() dto: UnitShiftDto) {
    return this.hr.setUnitShift(id, dto.workShiftId ?? null);
  }

  @Patch('settings') @HrManager()
  settings(@Body() dto: SettingsDto) {
    return this.hr.updateSettings(dto);
  }

  @Get('staff') @HrManager()
  staff(@Query() q: StaffQuery) {
    return this.hr.staff(q);
  }

  @Post('staff/import') @HrManager() @HttpCode(200)
  importStaff(@Body() dto: StaffImportDto) {
    return this.hr.importStaff(dto.rows);
  }

  @Patch('staff/:userId') @HrManager() @HttpCode(204)
  updateStaff(@Param('userId', ParseIntPipe) userId: number, @Body() dto: UpdateStaffDto) {
    return this.hr.updateStaff(userId, dto);
  }

  @Patch('balances/:userId') @HrManager()
  balance(@Param('userId', ParseIntPipe) userId: number, @Body() dto: BalanceDto) {
    return this.hr.setBalance(userId, dto);
  }

  @Post('balances/rollover') @HrManager() @HttpCode(200)
  rollover(@Body() dto: RolloverDto) {
    return this.hr.rollover(dto);
  }
}
