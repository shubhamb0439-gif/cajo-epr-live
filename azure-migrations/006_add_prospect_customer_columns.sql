-- Add source, value to prospects
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'prospects' AND COLUMN_NAME = 'source')
    ALTER TABLE prospects ADD source NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'prospects' AND COLUMN_NAME = 'value')
    ALTER TABLE prospects ADD value DECIMAL(18,2) NULL;
GO

-- Add source, value, assigned_to, status to customers
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'customers' AND COLUMN_NAME = 'source')
    ALTER TABLE customers ADD source NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'customers' AND COLUMN_NAME = 'value')
    ALTER TABLE customers ADD value DECIMAL(18,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'customers' AND COLUMN_NAME = 'assigned_to')
    ALTER TABLE customers ADD assigned_to UNIQUEIDENTIFIER NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'customers' AND COLUMN_NAME = 'status')
    ALTER TABLE customers ADD status NVARCHAR(100) NULL DEFAULT 'active';
GO

-- FK for customers.assigned_to
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'FK_customer_user'
)
    ALTER TABLE customers ADD CONSTRAINT FK_customer_user FOREIGN KEY (assigned_to) REFERENCES users(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_customer_user' AND object_id = OBJECT_ID('customers'))
    CREATE INDEX IX_customer_user ON customers(assigned_to);
GO

PRINT 'Migration 006 completed — source, value, assigned_to added to prospects and customers.';
GO
