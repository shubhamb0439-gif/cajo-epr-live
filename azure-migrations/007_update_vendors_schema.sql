-- Add vendor_id (business identifier), vendor_name_legal, and per-category rating columns
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vendors' AND COLUMN_NAME = 'vendor_id')
    ALTER TABLE vendors ADD vendor_id NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vendors' AND COLUMN_NAME = 'vendor_name_legal')
    ALTER TABLE vendors ADD vendor_name_legal NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vendors' AND COLUMN_NAME = 'vendor_rating_price')
    ALTER TABLE vendors ADD vendor_rating_price DECIMAL(3,1) NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vendors' AND COLUMN_NAME = 'vendor_rating_quality')
    ALTER TABLE vendors ADD vendor_rating_quality DECIMAL(3,1) NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vendors' AND COLUMN_NAME = 'vendor_rating_lead')
    ALTER TABLE vendors ADD vendor_rating_lead DECIMAL(3,1) NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vendors' AND COLUMN_NAME = 'vendor_rating_average')
    ALTER TABLE vendors ADD vendor_rating_average DECIMAL(3,1) NULL DEFAULT 0;
GO

PRINT 'Migration 007 completed — vendor_id, vendor_name_legal, vendor_rating_* added to vendors.';
GO
