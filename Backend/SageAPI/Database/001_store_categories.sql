-- Store categories. Safe to run more than once: tables that already exist are left alone.
USE [OnlineStore];
GO

-- The store's categories (a flat list; ParentCategoryID and SortOrder are no longer used)
IF OBJECT_ID(N'dbo.StoreCategory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.StoreCategory
    (
        CategoryID          int IDENTITY(1,1) PRIMARY KEY,
        ParentCategoryID    int NULL REFERENCES dbo.StoreCategory (CategoryID),
        Name                nvarchar(100) NOT NULL,
        SortOrder           int NOT NULL DEFAULT (0),
        IsVisible           bit NOT NULL DEFAULT (1)
    );

    CREATE UNIQUE INDEX UX_StoreCategory_Parent_Name ON dbo.StoreCategory (ParentCategoryID, Name);
    PRINT 'Created dbo.StoreCategory';
END
ELSE
    PRINT 'dbo.StoreCategory already exists - left alone';
GO

-- Which category each Sage item is in. Items with no row or no category show under "Other".
IF OBJECT_ID(N'dbo.InventoryCategory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventoryCategory
    (
        StockLink           int PRIMARY KEY,                    -- Sage StkItem.StockLink
        ItemCode            nvarchar(50) NOT NULL,              -- Sage item code
        CategoryID          int NULL REFERENCES dbo.StoreCategory (CategoryID) ON DELETE SET NULL,
        IsVisible           bit NOT NULL DEFAULT (1),           -- Show in store
        UpdatedAt           datetime2(0) NOT NULL DEFAULT (sysutcdatetime())
    );
    PRINT 'Created dbo.InventoryCategory';
END
ELSE
    PRINT 'dbo.InventoryCategory already exists - left alone';
GO
