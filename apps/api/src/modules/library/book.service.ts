import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  BookRow,
  BookCopyRow,
  BookResponseDto,
  BookCopyResponseDto,
  BookDetailResponseDto,
  toBookResponse,
  toCopyResponse,
} from './entities/library.entity';
import { AddBookDto, UpdateBookDto, BookQueryDto, AddCopyDto, UpdateCopyDto } from './dto/library.dto';

@Injectable()
export class BookService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async addBook(dto: AddBookDto): Promise<BookResponseDto> {
    const [row] = await this.tenantPrisma.query<BookRow>(
      `INSERT INTO books (title, author, publisher, isbn, category_id, edition, language, description)
       VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8)
       RETURNING *`,
      dto.title,
      dto.author ?? null,
      dto.publisher ?? null,
      dto.isbn ?? null,
      dto.categoryId ?? null,
      dto.edition ?? null,
      dto.language ?? 'Nepali',
      dto.description ?? null,
    );
    return toBookResponse(row);
  }

  async updateBook(id: string, dto: UpdateBookDto): Promise<BookResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    if (dto.title !== undefined) { params.push(dto.title); sets.push(`title = $${params.length}`); }
    if (dto.author !== undefined) { params.push(dto.author); sets.push(`author = $${params.length}`); }
    if (dto.publisher !== undefined) { params.push(dto.publisher); sets.push(`publisher = $${params.length}`); }
    if (dto.isbn !== undefined) { params.push(dto.isbn); sets.push(`isbn = $${params.length}`); }
    if (dto.categoryId !== undefined) { params.push(dto.categoryId); sets.push(`category_id = $${params.length}::uuid`); }
    if (dto.edition !== undefined) { params.push(dto.edition); sets.push(`edition = $${params.length}`); }
    if (dto.language !== undefined) { params.push(dto.language); sets.push(`language = $${params.length}`); }
    if (dto.description !== undefined) { params.push(dto.description); sets.push(`description = $${params.length}`); }

    params.push(id);
    const rows = await this.tenantPrisma.query<BookRow>(
      `UPDATE books SET ${sets.join(', ')}
       WHERE id = $${params.length}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Book ${id} not found`);
    return toBookResponse(rows[0]);
  }

  async softDeleteBook(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE books SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!affected) throw new NotFoundException(`Book ${id} not found`);
  }

  async searchBooks(
    query: BookQueryDto,
  ): Promise<{ data: BookResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const search = query.search?.trim();

    const conditions: string[] = ['b.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (search) {
      params.push(search);
      const n = params.length;
      conditions.push(
        `(to_tsvector('english', b.title) @@ plainto_tsquery('english', $${n})` +
          ` OR b.author ILIKE '%' || $${n} || '%'` +
          ` OR b.isbn = $${n})`,
      );
    }

    if (query.categoryId) {
      params.push(query.categoryId);
      conditions.push(`b.category_id = $${params.length}::uuid`);
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);
    const limitN = params.length - 1;
    const offsetN = params.length;

    const rows = await this.tenantPrisma.query<BookRow>(
      `SELECT b.*, bc.name as category_name, COUNT(*) OVER() as total_count
       FROM books b
       LEFT JOIN book_categories bc ON bc.id = b.category_id AND bc.deleted_at IS NULL
       WHERE ${where}
       ORDER BY b.title ASC
       LIMIT $${limitN} OFFSET $${offsetN}`,
      ...params,
    );

    const total = rows[0] ? parseInt(String(rows[0].total_count ?? '0')) : 0;
    return { data: rows.map(toBookResponse), meta: { page, limit, total } };
  }

  async getBookDetail(id: string): Promise<BookDetailResponseDto> {
    const bookRows = await this.tenantPrisma.query<BookRow & { category_name: string | null; cat_id: string | null }>(
      `SELECT b.*, bc.id as cat_id, bc.name as category_name
       FROM books b
       LEFT JOIN book_categories bc ON bc.id = b.category_id AND bc.deleted_at IS NULL
       WHERE b.id = $1::uuid AND b.deleted_at IS NULL`,
      id,
    );
    if (!bookRows[0]) throw new NotFoundException(`Book ${id} not found`);
    const book = bookRows[0];

    const copies = await this.tenantPrisma.query<BookCopyRow>(
      `SELECT bc.*,
         bi.member_id    AS current_member_id,
         lm.member_number AS current_member_number,
         bi.due_date     AS current_due_date
       FROM book_copies bc
       LEFT JOIN book_issues bi ON bi.book_copy_id = bc.id AND bi.status = 'ISSUED'
       LEFT JOIN library_members lm ON lm.id = bi.member_id
       WHERE bc.book_id = $1::uuid AND bc.deleted_at IS NULL
       ORDER BY bc.copy_number ASC`,
      id,
    );

    const copyDtos = copies.map(toCopyResponse);
    return {
      id: book.id,
      title: book.title,
      author: book.author ?? null,
      publisher: book.publisher ?? null,
      isbn: book.isbn ?? null,
      edition: book.edition ?? null,
      language: book.language,
      categoryName: book.category_name ?? null,
      description: book.description ?? null,
      totalCopies: copyDtos.length,
      availableCopies: copyDtos.filter((c) => c.isAvailable).length,
      copies: copyDtos,
    };
  }

  async addCopy(bookId: string, dto: AddCopyDto): Promise<BookCopyResponseDto> {
    return this.tenantPrisma.run(async (tx) => {
      const existing = await tx.$queryRawUnsafe<BookCopyRow[]>(
        `SELECT id FROM book_copies WHERE book_id = $1::uuid AND copy_number = $2 AND deleted_at IS NULL`,
        bookId,
        dto.copyNumber,
      );
      if (existing.length > 0) {
        throw new BadRequestException(
          `Copy number '${dto.copyNumber}' already exists for this book`,
        );
      }

      const [copy] = await tx.$queryRawUnsafe<BookCopyRow[]>(
        `INSERT INTO book_copies (book_id, copy_number, accession_number, shelf_location, condition)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING *`,
        bookId,
        dto.copyNumber,
        dto.accessionNumber ?? null,
        dto.shelfLocation ?? null,
        dto.condition ?? 'GOOD',
      );
      return toCopyResponse(copy);
    });
  }

  async listCopies(bookId: string): Promise<BookCopyResponseDto[]> {
    const rows = await this.tenantPrisma.query<BookCopyRow>(
      `SELECT bc.*,
         bi.member_id    AS current_member_id,
         lm.member_number AS current_member_number,
         bi.due_date     AS current_due_date
       FROM book_copies bc
       LEFT JOIN book_issues bi ON bi.book_copy_id = bc.id AND bi.status = 'ISSUED'
       LEFT JOIN library_members lm ON lm.id = bi.member_id
       WHERE bc.book_id = $1::uuid AND bc.deleted_at IS NULL
       ORDER BY bc.copy_number ASC`,
      bookId,
    );
    return rows.map(toCopyResponse);
  }

  async updateCopy(bookId: string, copyId: string, dto: UpdateCopyDto): Promise<BookCopyResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    if (dto.shelfLocation !== undefined) { params.push(dto.shelfLocation); sets.push(`shelf_location = $${params.length}`); }
    if (dto.condition !== undefined) { params.push(dto.condition); sets.push(`condition = $${params.length}`); }

    params.push(copyId, bookId);
    const copyN = params.length - 1;
    const bookN = params.length;

    const rows = await this.tenantPrisma.query<BookCopyRow>(
      `UPDATE book_copies SET ${sets.join(', ')}
       WHERE id = $${copyN}::uuid AND book_id = $${bookN}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Copy ${copyId} not found for book ${bookId}`);
    return toCopyResponse(rows[0]);
  }
}
