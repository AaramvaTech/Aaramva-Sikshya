import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { CredentialMailer } from './credential-mailer.service';
import { MailListener } from './mail.listener';
import { PublicPrismaService } from '../super-admin/public-prisma.service';

@Module({
  providers: [MailService, CredentialMailer, MailListener, PublicPrismaService],
  exports: [MailService, CredentialMailer],
})
export class MailModule {}
