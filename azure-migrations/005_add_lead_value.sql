-- Add lead_value column to leads table
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'lead_value'
)
ALTER TABLE leads ADD lead_value DECIMAL(18,2) NULL;
GO
