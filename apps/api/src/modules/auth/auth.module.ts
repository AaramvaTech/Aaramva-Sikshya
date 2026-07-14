import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TenantProvisioningService } from '../super-admin/tenant-provisioning.service';
import { CredentialDeliveryModule } from '../credential-delivery/credential-delivery.module';

@Module({
  imports: [
    PassportModule,
    // Empty config — each token is signed with an explicit secret/expiry in AuthService.
    JwtModule.register({}),
    CredentialDeliveryModule, // REG-1: TenantProvisioningService enqueues owner creds
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TenantProvisioningService],
  exports: [AuthService, TenantProvisioningService],
})
export class AuthModule {}
