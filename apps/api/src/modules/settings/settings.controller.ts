import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SettingsService } from './settings.service';
import { UpdateProfileDto } from './dto/settings.dto';

const EDITOR_ROLES = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];
const VIEWER_ROLES = [...EDITOR_ROLES, Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT];

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('profile')
  @Roles(...VIEWER_ROLES)
  getProfile() {
    return this.settingsService.getProfile();
  }

  @Patch('profile')
  @Roles(...EDITOR_ROLES)
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.settingsService.updateProfile(dto);
  }

  @Post('branding/rederive')
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER)
  async rederiveBrandingColor() {
    await this.settingsService.rederiveBrandingColor();
    return { message: 'Branding color re-derived from logo' };
  }
}
