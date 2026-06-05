import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BookCategoryService } from './book-category.service';
import { BookService } from './book.service';
import { LibraryMemberService } from './library-member.service';
import { IssueService } from './issue.service';
import {
  CreateBookCategoryDto,
  AddBookDto, UpdateBookDto, BookQueryDto, AddCopyDto, UpdateCopyDto,
  RegisterMemberDto, UpdateMemberDto, MemberQueryDto,
  IssueBookDto, ReturnBookDto, IssueQueryDto,
} from './dto/library.dto';

const PRINCIPAL_AND_ABOVE = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];
const LIBRARIAN_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
];
const ALL_ROLES = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
  Role.TEACHER, Role.STUDENT, Role.PARENT,
];

@Controller('library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryController {
  constructor(
    private readonly categoryService: BookCategoryService,
    private readonly bookService: BookService,
    private readonly memberService: LibraryMemberService,
    private readonly issueService: IssueService,
  ) {}

  // ─── Book Categories ────────────────────────────────────────────────────────

  @Post('categories')
  @Roles(...LIBRARIAN_AND_ABOVE)
  createCategory(@Body() dto: CreateBookCategoryDto) {
    return this.categoryService.createCategory(dto);
  }

  @Get('categories')
  @Roles(...ALL_ROLES)
  listCategories() {
    return this.categoryService.listCategories();
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...PRINCIPAL_AND_ABOVE)
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.deleteCategory(id);
  }

  // ─── Books ──────────────────────────────────────────────────────────────────

  @Post('books')
  @Roles(...LIBRARIAN_AND_ABOVE)
  addBook(@Body() dto: AddBookDto) {
    return this.bookService.addBook(dto);
  }

  @Get('books')
  @Roles(...ALL_ROLES)
  listBooks(@Query() query: BookQueryDto) {
    return this.bookService.searchBooks(query);
  }

  @Get('books/:id')
  @Roles(...ALL_ROLES)
  getBook(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookService.getBookDetail(id);
  }

  @Patch('books/:id')
  @Roles(...LIBRARIAN_AND_ABOVE)
  updateBook(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookDto) {
    return this.bookService.updateBook(id, dto);
  }

  @Delete('books/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...PRINCIPAL_AND_ABOVE)
  deleteBook(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookService.softDeleteBook(id);
  }

  @Post('books/:id/copies')
  @Roles(...LIBRARIAN_AND_ABOVE)
  addCopy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCopyDto) {
    return this.bookService.addCopy(id, dto);
  }

  @Get('books/:id/copies')
  @Roles(...LIBRARIAN_AND_ABOVE)
  listCopies(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookService.listCopies(id);
  }

  @Patch('books/:id/copies/:copyId')
  @Roles(...LIBRARIAN_AND_ABOVE)
  updateCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('copyId', ParseUUIDPipe) copyId: string,
    @Body() dto: UpdateCopyDto,
  ) {
    return this.bookService.updateCopy(id, copyId, dto);
  }

  // ─── Library Members ────────────────────────────────────────────────────────

  @Post('members')
  @Roles(...LIBRARIAN_AND_ABOVE)
  registerMember(@Body() dto: RegisterMemberDto) {
    return this.memberService.registerMember(dto);
  }

  @Get('members')
  @Roles(...LIBRARIAN_AND_ABOVE)
  listMembers(@Query() query: MemberQueryDto) {
    return this.memberService.listMembers(query);
  }

  @Get('members/:id')
  @Roles(...LIBRARIAN_AND_ABOVE)
  getMemberDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberService.getMemberDetail(id);
  }

  @Patch('members/:id')
  @Roles(...LIBRARIAN_AND_ABOVE)
  updateMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto) {
    return this.memberService.updateMember(id, dto);
  }

  // ─── Issue & Return ─────────────────────────────────────────────────────────

  @Post('issues')
  @Roles(...LIBRARIAN_AND_ABOVE)
  issueBook(@Body() dto: IssueBookDto, @CurrentUser() user: AuthUser) {
    return this.issueService.issueBook(dto, user.userId);
  }

  @Get('issues/overdue')
  @Roles(...LIBRARIAN_AND_ABOVE)
  getOverdueIssues(@Query() query: IssueQueryDto) {
    return this.issueService.getOverdueIssues(query);
  }

  @Get('issues')
  @Roles(...LIBRARIAN_AND_ABOVE)
  getIssues(@Query() query: IssueQueryDto) {
    return this.issueService.getIssues(query);
  }

  @Patch('issues/:id/return')
  @Roles(...LIBRARIAN_AND_ABOVE)
  returnBook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnBookDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.issueService.returnBook(id, dto, user.userId);
  }

  @Patch('issues/:id/mark-lost')
  @Roles(...LIBRARIAN_AND_ABOVE)
  markLost(@Param('id', ParseUUIDPipe) id: string) {
    return this.issueService.markLost(id);
  }

  @Patch('issues/:id/pay-fine')
  @Roles(...LIBRARIAN_AND_ABOVE)
  payFine(@Param('id', ParseUUIDPipe) id: string) {
    return this.issueService.payFine(id);
  }
}
