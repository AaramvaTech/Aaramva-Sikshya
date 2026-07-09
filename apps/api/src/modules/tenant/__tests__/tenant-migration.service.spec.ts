import {
  MigrationFile,
  TenantMigrationError,
  TenantMigrationService,
} from '../tenant-migration.service';

const file = (name: string, body: string): MigrationFile => ({
  name,
  sql: body,
  checksum: TenantMigrationService.checksum(body),
});

describe('TenantMigrationService (pure logic)', () => {
  describe('orderMigrations', () => {
    it('orders strictly by zero-padded name, not insertion order', () => {
      const files = [
        file('0010_late', 'a'),
        file('0002_second', 'b'),
        file('0001_baseline', 'c'),
      ];
      expect(TenantMigrationService.orderMigrations(files).map((f) => f.name)).toEqual([
        '0001_baseline',
        '0002_second',
        '0010_late',
      ]);
    });

    it('does not mutate the input array', () => {
      const files = [file('0002_b', 'x'), file('0001_a', 'y')];
      const snapshot = files.map((f) => f.name);
      TenantMigrationService.orderMigrations(files);
      expect(files.map((f) => f.name)).toEqual(snapshot);
    });
  });

  describe('computePending', () => {
    const ordered = TenantMigrationService.orderMigrations([
      file('0001_baseline', 'a'),
      file('0002_add_x', 'b'),
      file('0003_add_y', 'c'),
    ]);

    it('returns every migration when nothing is applied', () => {
      expect(TenantMigrationService.computePending(ordered, []).map((f) => f.name)).toEqual([
        '0001_baseline',
        '0002_add_x',
        '0003_add_y',
      ]);
    });

    it('returns only the unapplied tail, preserving order', () => {
      expect(
        TenantMigrationService.computePending(ordered, ['0001_baseline']).map((f) => f.name),
      ).toEqual(['0002_add_x', '0003_add_y']);
    });

    it('returns nothing when all are applied', () => {
      expect(
        TenantMigrationService.computePending(ordered, [
          '0001_baseline',
          '0002_add_x',
          '0003_add_y',
        ]),
      ).toEqual([]);
    });
  });

  describe('assertChecksumsMatch', () => {
    const files = [file('0001_baseline', 'SELECT 1;'), file('0002_add_x', 'SELECT 2;')];

    it('passes when every applied checksum matches the file on disk', () => {
      const applied = [{ name: '0001_baseline', checksum: files[0].checksum }];
      expect(() => TenantMigrationService.assertChecksumsMatch(files, applied)).not.toThrow();
    });

    it('aborts when an applied migration was edited (checksum drift)', () => {
      const applied = [{ name: '0001_baseline', checksum: 'deadbeef' }];
      expect(() => TenantMigrationService.assertChecksumsMatch(files, applied)).toThrow(
        TenantMigrationError,
      );
      expect(() => TenantMigrationService.assertChecksumsMatch(files, applied)).toThrow(
        /Checksum mismatch for "0001_baseline"/,
      );
    });

    it('aborts when an applied migration file has been deleted', () => {
      const applied = [{ name: '0009_gone', checksum: 'whatever' }];
      expect(() => TenantMigrationService.assertChecksumsMatch(files, applied)).toThrow(
        /no file on disk/,
      );
    });
  });

  describe('splitStatements', () => {
    it('strips whole-line comments and splits on semicolons', () => {
      const sql = [
        '-- a comment',
        'CREATE TABLE a (id int);',
        '',
        '-- another',
        'CREATE INDEX i ON a(id);',
      ].join('\n');
      expect(TenantMigrationService.splitStatements(sql)).toEqual([
        'CREATE TABLE a (id int)',
        'CREATE INDEX i ON a(id)',
      ]);
    });

    it('produces no empty trailing statement after a final semicolon', () => {
      expect(TenantMigrationService.splitStatements('SELECT 1;')).toEqual(['SELECT 1']);
    });
  });

  describe('checksum', () => {
    it('is stable and content-sensitive', () => {
      expect(TenantMigrationService.checksum('abc')).toBe(
        TenantMigrationService.checksum('abc'),
      );
      expect(TenantMigrationService.checksum('abc')).not.toBe(
        TenantMigrationService.checksum('abd'),
      );
    });
  });
});
