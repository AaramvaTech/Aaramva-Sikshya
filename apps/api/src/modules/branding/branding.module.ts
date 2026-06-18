import { Module } from '@nestjs/common';
import { BrandingColorService } from './branding-color.service';

@Module({
  providers: [BrandingColorService],
  exports: [BrandingColorService],
})
export class BrandingModule {}
