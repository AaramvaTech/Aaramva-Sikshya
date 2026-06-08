import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { LibraryController } from './library.controller';
import { BookCategoryService } from './book-category.service';
import { BookService } from './book.service';
import { LibraryMemberService } from './library-member.service';
import { IssueService } from './issue.service';

@Module({
  imports: [TenantModule],
  controllers: [LibraryController],
  providers: [BookCategoryService, BookService, LibraryMemberService, IssueService],
})
export class LibraryModule {}
