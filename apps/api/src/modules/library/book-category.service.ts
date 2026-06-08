import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  BookCategoryRow,
  BookCategoryResponseDto,
  toBookCategoryResponse,
} from './entities/library.entity';
import { CreateBookCategoryDto } from './dto/library.dto';

@Injectable()
export class BookCategoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createCategory(dto: CreateBookCategoryDto): Promise<BookCategoryResponseDto> {
    const [row] = await this.tenantPrisma.query<BookCategoryRow>(
      `INSERT INTO book_categories (name) VALUES ($1) RETURNING *`,
      dto.name,
    );
    return toBookCategoryResponse(row);
  }

  async listCategories(): Promise<BookCategoryResponseDto[]> {
    const rows = await this.tenantPrisma.query<BookCategoryRow>(
      `SELECT * FROM book_categories WHERE deleted_at IS NULL ORDER BY name ASC`,
    );
    return rows.map(toBookCategoryResponse);
  }

  async deleteCategory(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE book_categories SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!affected) throw new NotFoundException(`Category ${id} not found`);
  }
}
