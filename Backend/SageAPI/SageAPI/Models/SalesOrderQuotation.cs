namespace SageAPI.Models
{
    /// <summary>
    /// What a sales order and a quotation have in common. Everything except Customer is optional. The
    /// online store uses it for walk-in shoppers, who all go on one cash account: their own name, phone
    /// and address are written on the document instead.
    /// </summary>
    public abstract class SalesDocumentRequest
    {
        public string Customer { get; set; } = "";

        /// <summary>Our own reference, e.g. the online store's order number. Shown as "Order No" on the document.</summary>
        public string? ExternalOrderNo { get; set; }
        public string? Description { get; set; }
        public SalesOrderAddress? DeliverTo { get; set; }
        public string? MessageLine1 { get; set; }
        public string? MessageLine2 { get; set; }
        public string? MessageLine3 { get; set; }
        /// <summary>true when the line prices include VAT (the store sells at VAT-inclusive prices).</summary>
        public bool PricesIncludeTax { get; set; }

        public List<SalesDocumentLine> Lines { get; set; } = new List<SalesDocumentLine>();
    }

    public class SalesDocumentLine : SalesOrderLine
    {
        /// <summary>Optional Sage warehouse code the stock comes from, e.g. 2. Empty = the item's default warehouse.</summary>
        public string? Warehouse { get; set; }
        public string? Note { get; set; }
    }

    public class SalesOrderQuotation : SalesDocumentRequest
    {
    }
}
