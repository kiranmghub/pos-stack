# Fixing the Partially Applied Migration

The migration was partially run, leaving some indexes in the database. Follow these steps to fix it:

## Option 1: Drop the Partially Created Objects (Recommended)

1. Connect to your PostgreSQL database and run:

```sql
-- Check what exists
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'domain_extensions%';

-- Drop indexes that were created
DROP INDEX IF EXISTS domain_exte_tenant__idx;
DROP INDEX IF EXISTS domain_exte_tenant__idx2;
DROP INDEX IF EXISTS domain_exte_tenant__idx3;
DROP INDEX IF EXISTS domain_exte_invoice__idx;
DROP INDEX IF EXISTS domain_exte_receive__idx;
DROP INDEX IF EXISTS domain_exte_invoice__idx2;
DROP INDEX IF EXISTS domain_exte_invoice__idx3;
DROP INDEX IF EXISTS domain_exte_brand_n__idx;

-- Drop tables if they exist
DROP TABLE IF EXISTS domain_extensions_icdcinvoiceline CASCADE;
DROP TABLE IF EXISTS domain_extensions_icdcinvoice CASCADE;

-- Drop constraint if exists
ALTER TABLE domain_extensions_icdcinvoice DROP CONSTRAINT IF EXISTS uniq_icdc_number_per_tenant;
```

2. Delete the migration record (if any was created):
```sql
DELETE FROM django_migrations WHERE app = 'domain_extensions' AND name = '0001_initial';
```

3. Then run the migration again:
```bash
python manage.py migrate domain_extensions
```

## Option 2: Fake the Migration and Create New One

If the tables already exist and you want to keep the data:

1. Fake the current migration:
```bash
python manage.py migrate domain_extensions 0001 --fake
```

2. Create a new migration to rename the indexes:
```bash
python manage.py makemigrations domain_extensions
```

3. Apply it:
```bash
python manage.py migrate domain_extensions
```

## Option 3: Start Fresh (Development Only)

If this is a development environment and you don't mind losing data:

1. Drop all domain_extensions tables and indexes
2. Delete migration files 0001_initial.py and 0002_*.py
3. Recreate migrations:
```bash
python manage.py makemigrations domain_extensions
python manage.py migrate domain_extensions
```

