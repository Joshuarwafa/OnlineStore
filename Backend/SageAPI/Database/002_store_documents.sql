-- Store documents: our own record of every document the online store makes in Sage
-- (quotations now; sales orders, invoices and credit notes later). One header table and one
-- lines table, told apart by DocumentType. Safe to run more than once: tables that already exist are left alone.
USE [OnlineStore];
GO
-- Needed for the filtered index below (sqlcmd turns QUOTED_IDENTIFIER off by default)
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- One row per document
IF OBJECT_ID(N'dbo.StoreDocument', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.StoreDocument
    (
        DocumentID          int IDENTITY(1,1) PRIMARY KEY,
        DocumentType        varchar(20)   NOT NULL
            CONSTRAINT CK_StoreDocument_Type CHECK (DocumentType IN ('Quotation', 'SalesOrder', 'Invoice', 'CreditNote')),
        DocumentNo          nvarchar(30)  NOT NULL,             -- the store's number, e.g. WEB-261106-5QF7
        SageDocumentNo      nvarchar(50)  NULL,                 -- Sage's number, e.g. SOQ0002
        Status              varchar(20)   NOT NULL DEFAULT ('Posted'),
        -- e.g. the quotation an invoice was made from, or the invoice a credit note reverses
        SourceDocumentID    int           NULL REFERENCES dbo.StoreDocument (DocumentID),
        -- the same checkout pressed twice must never make two documents
        IdempotencyKey      nvarchar(100) NULL,
        DocumentDate        datetime2(0)  NOT NULL,             -- UTC

        -- Sage account the document is on (the cash account for walk-in shoppers)
        SageAccount         nvarchar(50)  NULL,
        SageAccountName     nvarchar(100) NULL,

        -- the shopper
        CustomerName        nvarchar(80)  NULL,
        CustomerPhone       nvarchar(30)  NULL,
        CustomerEmail       nvarchar(120) NULL,

        Fulfilment          varchar(20)   NULL,                 -- delivery | collection
        DeliveryAddress     nvarchar(300) NULL,
        Payment             varchar(20)   NULL,                 -- on_collection | on_delivery | online
        BranchCode          nvarchar(20)  NULL,                 -- Sage warehouse code
        BranchName          nvarchar(100) NULL,

        -- the three message lines written on the document in Sage
        Message1            nvarchar(100) NULL,
        Message2            nvarchar(100) NULL,
        Message3            nvarchar(100) NULL,

        Currency            varchar(10)   NOT NULL DEFAULT ('USD'),
        TotalExcl           decimal(18,2) NOT NULL DEFAULT (0),
        TotalTax            decimal(18,2) NOT NULL DEFAULT (0),
        TotalIncl           decimal(18,2) NOT NULL DEFAULT (0),

        CreatedAt           datetime2(0)  NOT NULL DEFAULT (sysutcdatetime()),
        UpdatedAt           datetime2(0)  NOT NULL DEFAULT (sysutcdatetime())
    );

    CREATE UNIQUE INDEX UX_StoreDocument_Type_No ON dbo.StoreDocument (DocumentType, DocumentNo);
    CREATE UNIQUE INDEX UX_StoreDocument_IdempotencyKey ON dbo.StoreDocument (IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;
    CREATE INDEX IX_StoreDocument_Date ON dbo.StoreDocument (DocumentDate DESC);
    CREATE INDEX IX_StoreDocument_SageNo ON dbo.StoreDocument (SageDocumentNo);
    PRINT 'Created dbo.StoreDocument';
END
ELSE
    PRINT 'dbo.StoreDocument already exists - left alone';
GO

-- The lines of each document
IF OBJECT_ID(N'dbo.StoreDocumentLine', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.StoreDocumentLine
    (
        LineID              int IDENTITY(1,1) PRIMARY KEY,
        DocumentID          int           NOT NULL REFERENCES dbo.StoreDocument (DocumentID) ON DELETE CASCADE,
        [LineNo]            int           NOT NULL,             -- 1, 2, 3… in the order printed
        ItemCode            nvarchar(40)  NOT NULL,
        Description         nvarchar(200) NULL,
        Warehouse           nvarchar(20)  NULL,
        Quantity            decimal(18,4) NOT NULL,
        UnitPriceExcl       decimal(18,4) NOT NULL,
        UnitPriceIncl       decimal(18,4) NOT NULL,
        LineTotalExcl       decimal(18,2) NOT NULL,
        LineTax             decimal(18,2) NOT NULL,
        LineTotalIncl       decimal(18,2) NOT NULL,
        Note                nvarchar(200) NULL
    );

    CREATE UNIQUE INDEX UX_StoreDocumentLine_Doc_Line ON dbo.StoreDocumentLine (DocumentID, [LineNo]);
    CREATE INDEX IX_StoreDocumentLine_Item ON dbo.StoreDocumentLine (ItemCode);
    PRINT 'Created dbo.StoreDocumentLine';
END
ELSE
    PRINT 'dbo.StoreDocumentLine already exists - left alone';
GO
