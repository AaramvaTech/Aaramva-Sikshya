import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { NoticeService } from './notice.service';
import { SmsService } from './sms.service';
import { NotificationService } from './notification.service';
import { DeviceTokenService } from './device-token.service';
import { CreateNoticeDto, ListNoticesQueryDto, UpdateNoticeDto } from './dto/notice.dto';
import { BulkSmsDto, SendSmsDto, SmsLogsQueryDto } from './dto/sms.dto';
import { GetNotificationsQueryDto } from './dto/notification.dto';
import { RegisterDeviceDto } from './dto/device-token.dto';

const ALL_ROLES = Object.values(Role);

const TEACHER_AND_ABOVE = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
  Role.LIBRARIAN,
  Role.TEACHER,
];

const PRINCIPAL_AND_ABOVE = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
];

@Controller('communication')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunicationController {
  constructor(
    private readonly noticeService: NoticeService,
    private readonly smsService: SmsService,
    private readonly notificationService: NotificationService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  // ─── Notices ──────────────────────────────────────────────────────────────

  @Post('notices')
  @Roles(...TEACHER_AND_ABOVE)
  createNotice(@Body() dto: CreateNoticeDto, @CurrentUser() user: AuthUser) {
    return this.noticeService.createNotice(dto, user.userId);
  }

  @Get('notices')
  @Roles(...ALL_ROLES)
  getNotices(@Query() query: ListNoticesQueryDto, @CurrentUser() user: AuthUser) {
    return this.noticeService.getNotices(query, user.role, null);
  }

  @Get('notices/:id')
  @Roles(...ALL_ROLES)
  getNoticeById(@Param('id', ParseUUIDPipe) id: string) {
    return this.noticeService.getNoticeById(id);
  }

  @Patch('notices/:id')
  @Roles(...TEACHER_AND_ABOVE)
  updateNotice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoticeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.noticeService.updateNotice(id, dto, user.userId, user.role);
  }

  @Patch('notices/:id/publish')
  @Roles(...PRINCIPAL_AND_ABOVE)
  publishNotice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.noticeService.publishNotice(id, user.userId);
  }

  @Delete('notices/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  deleteNotice(@Param('id', ParseUUIDPipe) id: string) {
    return this.noticeService.deleteNotice(id);
  }

  // ─── SMS ──────────────────────────────────────────────────────────────────

  @Post('sms/send')
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACCOUNTANT)
  sendSms(@Body() dto: SendSmsDto) {
    return this.smsService.send(dto.toNumber, dto.message, 'MANUAL', dto.studentId);
  }

  @Post('sms/bulk')
  @Roles(...PRINCIPAL_AND_ABOVE)
  bulkSms(@Body() dto: BulkSmsDto) {
    return this.smsService.bulkSend({
      audience: dto.audience,
      classId: dto.classId,
      sectionId: dto.sectionId,
      customNumbers: dto.customNumbers,
      message: dto.message,
      trigger: dto.trigger,
    });
  }

  @Get('sms/logs')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getSmsLogs(@Query() query: SmsLogsQueryDto) {
    return this.smsService.getSmsLogs(query);
  }

  @Post('sms/retry/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  retrySms(@Param('id', ParseUUIDPipe) id: string) {
    return this.smsService.retrySms(id);
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  @Get('notifications')
  @Roles(...ALL_ROLES)
  getMyNotifications(
    @Query() query: GetNotificationsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationService.getMyNotifications(user.userId, query);
  }

  @Get('notifications/unread-count')
  @Roles(...ALL_ROLES)
  getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationService.getUnreadCount(user.userId);
  }

  @Patch('notifications/:id/read')
  @Roles(...ALL_ROLES)
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notificationService.markAsRead(id, user.userId);
  }

  @Patch('notifications/read-all')
  @Roles(...ALL_ROLES)
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllAsRead(user.userId);
  }

  // ─── Device Tokens ────────────────────────────────────────────────────────

  @Post('devices')
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.ACCOUNTANT, Role.LIBRARIAN, Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  registerDevice(@Body() dto: RegisterDeviceDto, @CurrentUser() user: AuthUser) {
    return this.deviceTokenService.register(user.userId, dto);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.ACCOUNTANT, Role.LIBRARIAN, Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  removeDevice(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.deviceTokenService.remove(user.userId, token);
  }
}
