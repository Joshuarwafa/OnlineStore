-- Store documents are saved first (Pending), then made in Sage, then marked Posted with Sage's
-- number, or Failed with Sage's reason. Adds the columns for that. Safe to run more than once.
USE [OnlineStore];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.StoreDocument', N'FailReason') IS NULL
BEGIN
    ALTER TABLE dbo.StoreDocument ADD FailReason nvarchar(500) NULL;   -- why Sage refused it
    PRINT 'Added dbo.StoreDocument.FailReason';
END
GO

IF COL_LENGTH(N'dbo.StoreDocument', N'PostedAt') IS NULL
BEGIN
    ALTER TABLE dbo.StoreDocument ADD PostedAt datetime2(0) NULL;      -- when Sage accepted it (UTC)
    PRINT 'Added dbo.StoreDocument.PostedAt';
END
GO

-- Documents recorded before this script were already in Sage
UPDATE dbo.StoreDocument SET PostedAt = CreatedAt WHERE Status = 'Posted' AND PostedAt IS NULL;
GO

IF OBJECT_ID(N'dbo.CK_StoreDocument_Status', N'C') IS NULL
BEGIN
    ALTER TABLE dbo.StoreDocument ADD CONSTRAINT CK_StoreDocument_Status
        CHECK (Status IN ('Pending', 'Posted', 'Failed', 'Cancelled'));
    PRINT 'Added the Status check';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StoreDocument_Status' AND object_id = OBJECT_ID(N'dbo.StoreDocument'))
BEGIN
    CREATE INDEX IX_StoreDocument_Status ON dbo.StoreDocument (Status, DocumentDate);
    PRINT 'Created IX_StoreDocument_Status';
END
GO
