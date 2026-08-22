import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BookService } from '../book.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

const baseBookRow = {
  id: 'book-1',
  title: 'Wings of Fire',
  author: 'APJ Abdul Kalam',
  publisher: 'Universities Press',
  isbn: '9780863111778',
  category_id: 'cat-1',
  category_name: 'Biography',
  edition: '1st',
  language: 'English',
  description: null,
  cover_url: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
};

const baseCopyRow = {
  id: 'copy-1',
  book_id: 'book-1',
  copy_number: '001',
  accession_number: 'ACC-001',
  shelf_location: 'A-1',
  condition: 'GOOD',
  is_available: true,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
};

describe('BookService', () => {
  let service: BookService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BookService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('addBook()', () => {
    it('creates a book record and returns it', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseBookRow]);

      const result = await service.addBook({ title: 'Wings of Fire', author: 'APJ Abdul Kalam' });

      expect(result.id).toBe('book-1');
      expect(result.title).toBe('Wings of Fire');
      const callSql = (tenantPrisma.query as jest.Mock).mock.calls[0][0] as string;
      expect(callSql).toContain('INSERT INTO books');
      expect(callSql).toContain('RETURNING *');
    });
  });

  describe('searchBooks()', () => {
    it('returns paginated books matching a search term', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...baseBookRow, total_count: '1' },
      ]);

      const result = await service.searchBooks({ search: 'wings', page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Wings of Fire');
      expect(result.meta.total).toBe(1);
    });

    it('returns all books when no search term provided', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...baseBookRow, total_count: '1' },
      ]);

      const result = await service.searchBooks({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('addCopy()', () => {
    it('creates a copy with is_available=true', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([baseCopyRow]); // INSERT result

      const result = await service.addCopy('book-1', { copyNumber: '001', shelfLocation: 'A-1' });

      expect(result.isAvailable).toBe(true);
      expect(result.copyNumber).toBe('001');
    });

    it('throws BadRequestException if copy_number already exists for same book', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([baseCopyRow]); // duplicate found

      await expect(service.addCopy('book-1', { copyNumber: '001' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
