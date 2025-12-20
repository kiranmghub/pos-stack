-- Cleanup script for partially applied domain_extensions migration
-- Run this in your PostgreSQL database before re-running the migration

-- Drop any indexes that were created (with old names)
DROP INDEX IF EXISTS domain_extensions_icdcinvoice_domain_exte_tenant__idx;
DROP INDEX IF EXISTS domain_extensions_icdcinvoice_domain_exte_tenant__idx2;
DROP INDEX IF EXISTS domain_extensions_icdcinvoice_domain_exte_tenant__idx3;
DROP INDEX IF EXISTS domain_extensions_icdcinvoice_domain_exte_invoice__idx;
DROP INDEX IF EXISTS domain_extensions_icdcinvoice_domain_exte_receive__idx;
DROP INDEX IF EXISTS domain_extensions_icdcinvoiceline_domain_exte_invoice__idx;
DROP INDEX IF EXISTS domain_extensions_icdcinvoiceline_domain_exte_invoice__idx2;
DROP INDEX IF EXISTS domain_extensions_icdcinvoiceline_domain_exte_invoice__idx3;
DROP INDEX IF EXISTS domain_extensions_icdcinvoiceline_domain_exte_brand_n__idx;

-- Drop constraint if it exists
ALTER TABLE domain_extensions_icdcinvoice DROP CONSTRAINT IF EXISTS uniq_icdc_number_per_tenant;

-- Drop tables if they exist (this will also drop any indexes)
DROP TABLE IF EXISTS domain_extensions_icdcinvoiceline CASCADE;
DROP TABLE IF EXISTS domain_extensions_icdcinvoice CASCADE;

-- Remove migration record if it exists
DELETE FROM django_migrations WHERE app = 'domain_extensions' AND name = '0001_initial';

