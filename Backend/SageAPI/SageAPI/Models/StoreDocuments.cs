namespace SageAPI.Models
{
    /// <summary>The kinds of document kept in OnlineStore.dbo.StoreDocument.</summary>
    public static class StoreDocumentTypes
    {
        public const string Quotation = "Quotation";
        public const string SalesOrder = "SalesOrder";
        public const string Invoice = "Invoice";
        public const string CreditNote = "CreditNote";

        public static readonly string[] All = { Quotation, SalesOrder, Invoice, CreditNote };

        public static readonly string[] Statuses = { "Pending", "Posted", "Failed", "Cancelled" };

        /// <summary>"posted" → "Posted"; null when not a known status.</summary>
        public static string? ParseStatus(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : Statuses.FirstOrDefault(s => string.Equals(s, value.Trim(), StringComparison.OrdinalIgnoreCase));

        /// <summary>"quotation", "credit-note", "Credit Note" → the stored name; null when not a known type.</summary>
        public static string? Parse(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var key = new string(value.Where(char.IsLetter).ToArray());
            return All.FirstOrDefault(t => string.Equals(t, key, StringComparison.OrdinalIgnoreCase));
        }
    }

    /// <summary>A document to record: its header and lines. Line and header totals are worked out from the lines.</summary>
    public class StoreDocumentInput
    {
        public string DocumentType { get; set; } = "";
        public string DocumentNo { get; set; } = "";
        public string? SageDocumentNo { get; set; }
        /// <summary>Pending (saved before Sage is asked) or Posted (already in Sage). Default Posted.</summary>
        public string? Status { get; set; }
        /// <summary>Optional: the DocumentId of the document this one was made from (e.g. the quotation an invoice came from).</summary>
        public int? SourceDocumentId { get; set; }
        public string? IdempotencyKey { get; set; }
        public DateTime? DocumentDate { get; set; }

        public string? SageAccount { get; set; }
        public string? SageAccountName { get; set; }

        public string? CustomerName { get; set; }
        public string? CustomerPhone { get; set; }
        public string? CustomerEmail { get; set; }

        public string? Fulfilment { get; set; }
        public string? DeliveryAddress { get; set; }
        public string? Payment { get; set; }
        public string? BranchCode { get; set; }
        public string? BranchName { get; set; }

        public List<string> Messages { get; set; } = new();
        public string? Currency { get; set; }

        public List<StoreDocumentLineInput> Lines { get; set; } = new();
    }

    public class StoreDocumentLineInput
    {
        public string ItemCode { get; set; } = "";
        public string? Description { get; set; }
        public string? Warehouse { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPriceExcl { get; set; }
        public decimal UnitPriceIncl { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>A recorded document as read back.</summary>
    public class StoreDocumentDto
    {
        public int DocumentId { get; set; }
        public string DocumentType { get; set; } = "";
        public string DocumentNo { get; set; } = "";
        public string? SageDocumentNo { get; set; }
        public string Status { get; set; } = "";
        public int? SourceDocumentId { get; set; }
        public string? IdempotencyKey { get; set; }
        public DateTime DocumentDate { get; set; }

        public string? SageAccount { get; set; }
        public string? SageAccountName { get; set; }

        public string? CustomerName { get; set; }
        public string? CustomerPhone { get; set; }
        public string? CustomerEmail { get; set; }

        public string? Fulfilment { get; set; }
        public string? DeliveryAddress { get; set; }
        public string? Payment { get; set; }
        public string? BranchCode { get; set; }
        public string? BranchName { get; set; }

        public List<string> Messages { get; set; } = new();
        public string Currency { get; set; } = "";
        public decimal TotalExcl { get; set; }
        public decimal TotalTax { get; set; }
        public decimal TotalIncl { get; set; }

        /// <summary>Why Sage refused it (Failed only).</summary>
        public string? FailReason { get; set; }
        public DateTime? PostedAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        /// <summary>Filled when one document is asked for; empty in lists.</summary>
        public List<StoreDocumentLineDto> Lines { get; set; } = new();
        public int LineCount { get; set; }
    }

    public class StoreDocumentLineDto
    {
        public int LineNo { get; set; }
        public string ItemCode { get; set; } = "";
        public string? Description { get; set; }
        public string? Warehouse { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPriceExcl { get; set; }
        public decimal UnitPriceIncl { get; set; }
        public decimal LineTotalExcl { get; set; }
        public decimal LineTax { get; set; }
        public decimal LineTotalIncl { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>
    /// A document's new status: Posted (with Sage's number), Failed (with the reason) or Cancelled.
    /// A Failed document gives up its idempotency key, so the shopper can try again.
    /// </summary>
    public class StoreDocumentStatusInput
    {
        public string Status { get; set; } = "";
        public string? SageDocumentNo { get; set; }
        public string? FailReason { get; set; }
    }

    /// <summary>The result of recording a document: Existing = it was already there (same number or idempotency key).</summary>
    public class StoreDocumentSaveResult
    {
        public bool Existing { get; set; }
        public StoreDocumentDto Document { get; set; } = new();
    }
}
