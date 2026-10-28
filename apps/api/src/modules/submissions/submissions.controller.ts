import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { BatchApproveDto, CreateSubmissionDto, ReviewSubmissionDto } from './submissions.dto';
import { SubmissionsService } from './submissions.service';

@Controller()
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post('tasks/:taskId/submissions')
  create(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissions.create(user, taskId, dto);
  }

  @Post('submissions/approve-batch')
  @HttpCode(200)
  approveBatch(@CurrentUser() user: AuthUser, @Body() dto: BatchApproveDto) {
    return this.submissions.approveMany(user, dto.submissionIds);
  }

  @Post('submissions/:id/review')
  @HttpCode(204)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSubmissionDto,
  ) {
    return this.submissions.review(user, id, dto);
  }
}
