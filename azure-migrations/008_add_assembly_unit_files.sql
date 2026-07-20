/*
  ============================================================
  AZURE SQL MIGRATION 008 — Per-Unit Assembly Files
  ============================================================
  The Traceability screen lets you attach files to a specific
  serialized assembly unit, but assembly_files only supported
  a link to the parent assembly (batch), not the individual
  unit. This adds that missing column.
*/

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'assembly_files' AND COLUMN_NAME = 'assembly_unit_id'
)
BEGIN
  ALTER TABLE assembly_files ADD assembly_unit_id UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_af_unit'
)
BEGIN
  ALTER TABLE assembly_files
    ADD CONSTRAINT FK_af_unit FOREIGN KEY (assembly_unit_id)
    REFERENCES assembly_units(id) ON DELETE CASCADE;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_af_unit' AND object_id = OBJECT_ID('assembly_files'))
    CREATE INDEX IX_af_unit ON assembly_files(assembly_unit_id);
GO

PRINT 'Migration 008 completed successfully — assembly_unit_id added to assembly_files.';
GO
